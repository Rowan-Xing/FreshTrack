const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
const contractsSourceRoot = path.resolve(
  __dirname,
  "../../packages/contracts/src"
);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const originIsContractsSource =
    context.originModulePath === contractsSourceRoot ||
    context.originModulePath.startsWith(
      `${contractsSourceRoot}${path.sep}`
    );
  if (
    originIsContractsSource &&
    moduleName.startsWith(".") &&
    moduleName.endsWith(".js")
  ) {
    return context.resolveRequest(
      context,
      moduleName.slice(0, -3),
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
