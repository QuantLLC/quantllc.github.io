package com.alexk.quantlauncher.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val QuantDark = darkColorScheme(
    primary = Color(0xFF22D37A),
    onPrimary = Color(0xFF04140C),
    secondary = Color(0xFF8B93A7),
    background = Color(0x00000000),
    surface = Color(0xCC1A1D24),
    onSurface = Color(0xFFF3F5F8),
)

@Composable
fun QuantLauncherTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = QuantDark,
        content = content,
    )
}
