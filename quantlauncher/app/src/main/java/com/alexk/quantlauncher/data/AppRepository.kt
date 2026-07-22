package com.alexk.quantlauncher.data

import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable

data class LaunchableApp(
    val label: String,
    val packageName: String,
    val activityName: String,
    val icon: Drawable,
)

class AppRepository(private val packageManager: PackageManager) {
    fun loadLaunchableApps(): List<LaunchableApp> {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolveInfos = packageManager.queryIntentActivities(intent, 0)
        return resolveInfos
            .mapNotNull { info ->
                val activity = info.activityInfo ?: return@mapNotNull null
                LaunchableApp(
                    label = info.loadLabel(packageManager)?.toString().orEmpty()
                        .ifBlank { activity.packageName },
                    packageName = activity.packageName,
                    activityName = activity.name,
                    icon = info.loadIcon(packageManager),
                )
            }
            .sortedBy { it.label.lowercase() }
    }
}
