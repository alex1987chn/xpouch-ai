"""
短信服务模块

提供腾讯云短信发送功能，用于发送手机验证码。
支持开发和生产环境统一使用真实短信服务。
"""

import os
import logging
from typing import Optional, Tuple
from tencentcloud.common import credential
from tencentcloud.sms.v20210111 import sms_client, models
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException

logger = logging.getLogger(__name__)


class SMSServiceError(Exception):
    """短信服务错误"""
    pass


class SMSService:
    """腾讯云短信服务"""
    
    def __init__(self):
        """初始化短信服务，从环境变量读取配置"""
        self.secret_id = os.getenv("TENCENT_CLOUD_SECRET_ID")
        self.secret_key = os.getenv("TENCENT_CLOUD_SECRET_KEY")
        self.sdk_app_id = os.getenv("SMS_SDK_APP_ID")
        self.sign_name = os.getenv("SMS_SIGN_NAME")
        self.template_id = os.getenv("SMS_TEMPLATE_ID")
        self.region = os.getenv("SMS_REGION", "ap-guangzhou")
        
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
    
    def send_verification_code(self, phone_number: str, code: str, expire_minutes: int = 5) -> Tuple[bool, Optional[str]]:
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
            if not phone_number or len(phone_number) != 11 or not phone_number.startswith('1'):
                error_msg = f"无效的手机号格式: {phone_number}"
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
            
            # 调试日志：记录发送的详细信息
            logger.debug(f"短信发送调试 - 模板ID: {self.template_id}, 签名: {self.sign_name}")
            logger.debug(f"短信发送调试 - 参数数量: 1, 参数内容: [{code}]")
            
            # 发送短信
            resp = self.client.SendSms(req)
            
            # 检查发送结果
            if resp.SendStatusSet and len(resp.SendStatusSet) > 0:
                status = resp.SendStatusSet[0]
                if status.Code == "Ok":
                    logger.info(f"验证码短信发送成功: {phone_number[:3]}****{phone_number[-4:]}")
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
    
    def send_batch_verification_codes(self, phone_codes: list) -> Tuple[bool, dict]:
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
            results[phone_number] = {
                "success": success,
                "message": message
            }
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
    logger.warning(f"短信服务不可用: {str(e)}，将使用控制台输出模式")
except ImportError as e:
    sms_service = None
    SMS_SERVICE_AVAILABLE = False
    logger.warning(f"tencentcloud-sdk未安装: {str(e)}，将使用控制台输出模式")


def send_verification_code_with_fallback(phone_number: str, code: str, expire_minutes: int = 5) -> Tuple[bool, Optional[str]]:
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
    else:
        # 控制台输出模式（开发环境备用）
        masked_phone = f"{phone_number[:3]}****{phone_number[-4:]}"
        logger.warning(f"短信服务不可用，控制台输出验证码: {masked_phone} -> {code} (有效期{expire_minutes}分钟)")
        print(f"[DEBUG SMS] 验证码发送到 {masked_phone}: {code} (有效期{expire_minutes}分钟)")
        return True, None