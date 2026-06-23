const { withAndroidManifest } = require('@expo/config-plugins')

/**
 * Remove permissões desnecessárias do AndroidManifest que o
 * template base do Expo inclui mas o SnapGestão não utiliza.
 *
 * Criador: Diego Manhães
 * Data: 23/06/2026
 */
module.exports = function withBlockedPermissions(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest

    const permissions = manifest['uses-permission'] || []

    const blocked = ['android.permission.SYSTEM_ALERT_WINDOW']

    manifest['uses-permission'] = permissions.filter((perm) => {
      const name = perm.$['android:name']
      const isBlocked = blocked.includes(name)
      if (isBlocked) {
        console.log('[withBlockedPermissions]', 'Removida:', name)
      }
      return !isBlocked
    })

    return config
  })
}
