package com.alexk.quantlauncher.ui.dock

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.alexk.quantlauncher.data.LaunchableApp
import com.alexk.quantlauncher.ui.icons.AndroidLaunchpadIcon
import com.alexk.quantlauncher.ui.icons.QuantAppIcon

@Composable
fun MacDock(
    apps: List<LaunchableApp>,
    onLaunchpad: () -> Unit,
    onLaunchApp: (LaunchableApp) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(22.dp))
            .background(
                Brush.verticalGradient(
                    listOf(
                        Color(0xB3FFFFFF),
                        Color(0x66FFFFFF),
                        Color(0x33FFFFFF),
                    ),
                ),
            )
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DockItem(label = "Launchpad", onClick = onLaunchpad) {
                AndroidLaunchpadIcon(size = 52.dp)
            }

            Box(
                modifier = Modifier
                    .height(36.dp)
                    .padding(horizontal = 2.dp)
                    .background(Color(0x55FFFFFF), RoundedCornerShape(1.dp))
                    .padding(horizontal = 0.5.dp),
            )

            apps.forEach { app ->
                DockItem(label = app.label, onClick = { onLaunchApp(app) }) {
                    QuantAppIcon(
                        drawable = app.icon,
                        contentDescription = app.label,
                        size = 52.dp,
                    )
                }
            }
        }
    }
}

@Composable
private fun DockItem(
    label: String,
    onClick: () -> Unit,
    icon: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier.clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            onClick = onClick,
        ),
        contentAlignment = Alignment.Center,
    ) {
        icon()
        // Keep semantics via contentDescription on icons; tiny label for accessibility tooling only.
        Text(text = label, fontSize = 1.sp, color = Color.Transparent)
    }
}
