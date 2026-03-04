const quoteArgs = (files) => files.map((file) => `"${file}"`).join(" ");

const toFrontendRelative = (files) =>
  files
    .filter((file) => file.startsWith("frontend/"))
    .map((file) => file.replace(/^frontend\//, ""));

const toBackendRelative = (files) =>
  files
    .filter((file) => file.startsWith("backend/"))
    .map((file) => file.replace(/^backend\//, ""));

module.exports = {
  "frontend/**/*.{js,jsx,ts,tsx}": (files) => {
    const targets = toFrontendRelative(files);
    if (!targets.length) return [];

    return [
      `pnpm --prefix frontend exec eslint --cache --cache-location .eslintcache ${quoteArgs(targets)}`,
    ];
  },
  "backend/**/*.py": (files) => {
    const targets = toBackendRelative(files);
    if (!targets.length) return [];

    return [
      `uv run --directory backend ruff check ${quoteArgs(targets)}`,
    ];
  },
};
