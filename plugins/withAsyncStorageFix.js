const { withProjectBuildGradle } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

module.exports = function withAsyncStorageFix(config) {
  return withProjectBuildGradle(config, (config) => {
    // Garantir local.properties com sdk.dir
    const localProps = path.join(config.modRequest.platformProjectRoot, 'local.properties')
    if (!fs.existsSync(localProps)) {
      const sdkDir = process.env.ANDROID_HOME || 'C:\\\\Users\\\\admin\\\\AppData\\\\Local\\\\Android\\\\Sdk'
      fs.writeFileSync(localProps, `sdk.dir=${sdkDir.replace(/\\/g, '\\\\')}\n`)
    }

    // Adicionar repositório maven do asyncstorage
    if (config.modResults.contents.includes('asyncstorage-fix')) {
      return config
    }

    config.modResults.contents = config.modResults.contents.replace(
      /allprojects\s*\{[\s\S]*?repositories\s*\{/,
      (match) => {
        return match + `
    // asyncstorage-fix
    maven { url "$rootDir/../node_modules/@react-native-async-storage/async-storage/android/local_repo" }`
      }
    )

    return config
  })
}
