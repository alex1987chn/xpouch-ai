"""
短信服务模块

提供腾讯云短信发送功能，并为开发环境提供显式开关控制的 fallback。
"""

import logging

from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.sms.v20210111 import models, sms_client

from config import settings
from utils.verification import mask_phone_number

logger = logging.getLogger(__name__)


class SMSServiceError(Exception):
    """短信服务错误"""

    pass


class SMSService:
    """腾讯云短信服务"""

    def __init__(self):
        """初始化短信服务，从统一配置读取参数。"""
        self.secret_id = settings.tencent_cloud_secret_id
        self.secret_key = (
            settings.tencent_cloud_secret_key.get_secret_value()
            if settings.tencent_cloud_secret_key
            else None
        )
        self.sdk_app_id = settings.sms_sdk_app_id
        self.sign_name = settings.sms_sign_name
        self.template_id = settings.sms_template_id
        self.region = settings.sms_region

        # 检查必要配置
        self._validate_config()

        # 初始化客户端
        self.cred = credential.Credential(self.secret_id, self.secret_key)
        self.client = sms_client.SmsClient(self.cred, self.region)

        logger.info("腾讯云短信服务初始化成功")

    def _validate_config(self) -> None:
        """验证配置是否完整"""
        missing_configs = []

        if not self.secret_id:
            missing_configs.append("TENCENT_CLOUD_SECRET_ID")
        if not self.secret_key:
            missing_configs.append("TENCENT_CLOUD_SECRET_KEY")
        if not self.sdk_app_id:
            missing_configs.append("SMS_SDK_APP_ID")
        if not self.sign_name:
            missing_configs.append("SMS_SIGN_NAME")
        if not self.template_id:
            missing_configs.append("SMS_TEMPLATE_ID")

        if missing_configs:
            error_msg = f"短信服务配置缺失: {', '.join(missing_configs)}"
            logger.error(error_msg)
            raise SMSServiceError(error_msg)

    def send_verification_code(
        self, phone_number: str, code: str, expire_minutes: int = 5
    ) -> tuple[bool, str | None]:
        """
        发送验证码短信

        Args:
            phone_number: 手机号码（11位，不需要+86前缀）
            code: 验证码（6位数字）
            expire_minutes: 验证码有效期（分钟）

        Returns:
            (success: bool, message: Optional[str])
        """
        try:
            # 验证手机号格式
            if not phone_number or len(phone_number) != 11 or not phone_number.startswith("1"):
                error_msg = "无效的手机号格式"
                logger.error(error_msg)
                return False, error_msg

            # 构建请求
            req = models.SendSmsRequest()
            req.SmsSdkAppId = self.sdk_app_id
            req.SignName = self.sign_name
            req.TemplateId = self.template_id
            req.TemplateParamSet = [code]  # 模板只需要验证码一个参数
            req.PhoneNumberSet = [f"+86{phone_number}"]
            req.SessionContext = "XPouch AI 验证码"

            logger.debug(
                "短信发送请求已构建 | 模板ID=%s | 签名=%s | 手机号=%s",
                self.template_id,
                self.sign_name,
                mask_phone_number(phone_number),
            )

            # 发送短信
            resp = self.client.SendSms(req)

            # 检查发送结果
            if resp.SendStatusSet and len(resp.SendStatusSet) > 0:
                status = resp.SendStatusSet[0]
                if status.Code == "Ok":
                    logger.info("验证码短信发送成功: %s", mask_phone_number(phone_number))
                    return True, None
                else:
                    error_msg = f"短信发送失败: {status.Code} - {status.Message}"
                    logger.error(error_msg)
                    return False, error_msg
            else:
                error_msg = "短信发送响应异常"
                logger.error(error_msg)
                return False, error_msg

        except TencentCloudSDKException as e:
            error_msg = f"腾讯云SDK错误: {str(e)}"
            logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"短信发送未知错误: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    def send_batch_verification_codes(self, phone_codes: list) -> tuple[bool, dict]:
        """
        批量发送验证码短信

        Args:
            phone_codes: 列表，每个元素为(phone_number, code, expire_minutes)

        Returns:
            (success: bool, results: dict)
        """
        results = {}
        overall_success = True

        for phone_number, code, expire_minutes in phone_codes:
            success, message = self.send_verification_code(phone_number, code, expire_minutes)
            results[phone_number] = {"success": success, "message": message}
            if not success:
                overall_success = False

        return overall_success, results


# 全局实例
try:
    sms_service = SMSService()
    SMS_SERVICE_AVAILABLE = True
    logger.info("短信服务可用，已初始化腾讯云客户端")
except SMSServiceError as e:
    sms_service = None
    SMS_SERVICE_AVAILABLE = False
    logger.warning("短信服务不可用: %s", str(e))
except ImportError as e:
    sms_service = None
    SMS_SERVICE_AVAILABLE = False
    logger.warning("tencentcloud-sdk 未安装: %s", str(e))
except Exception as e:
    sms_service = None
    SMS_SERVICE_AVAILABLE = False
    logger.warning("短信服务初始化失败: %s", str(e))


def send_verification_code_with_fallback(
    phone_number: str, code: str, expire_minutes: int = 5
) -> tuple[bool, str | None]:
    """
    发送验证码，如果短信服务不可用则使用控制台输出

    Args:
        phone_number: 手机号码
        code: 验证码
        expire_minutes: 有效期（分钟）

    Returns:
        (success: bool, message: Optional[str])
    """
    if SMS_SERVICE_AVAILABLE and sms_service:
        return sms_service.send_verification_code(phone_number, code, expire_minutes)

    if settings.is_development and settings.sms_console_fallback_enabled:
        logger.warning(
            "短信服务不可用，已启用开发环境 fallback | 手机号=%s | 有效期=%s分钟",
            mask_phone_number(phone_number),
            expire_minutes,
        )
        return True, None

    logger.error("短信服务不可用，验证码发送失败: %s", mask_phone_number(phone_number))
    return False, "短信服务当前不可用，请稍后重试"
