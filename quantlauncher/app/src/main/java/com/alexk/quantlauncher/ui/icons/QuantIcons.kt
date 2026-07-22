package com.alexk.quantlauncher.ui.icons

import android.graphics.drawable.Drawable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.graphics.drawable.toBitmap

/**
 * Quant "icon pack" look: soft squircle tile + lifted shadow.
 * Uses the app's real drawable, restyled into a consistent desktop pack.
 */
@Composable
fun QuantAppIcon(
    drawable: Drawable?,
    contentDescription: String?,
    size: Dp = 56.dp,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val px = with(density) { size.roundToPx().coerceAtLeast(1) }
    val bitmap = remember(drawable, px) {
        drawable?.toBitmap(px, px)?.asImageBitmap()
    }
    val shape = RoundedCornerShape(size * 0.28f)

    Box(
        modifier = modifier
            .size(size)
            .shadow(10.dp, shape, clip = false)
            .clip(shape)
            .background(Color(0xFF1B1F28)),
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap,
                contentDescription = contentDescription,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(size * 0.08f)
                    .clip(RoundedCornerShape(size * 0.22f)),
            )
        }
    }
}

@Composable
fun AndroidLaunchpadIcon(
    size: Dp = 56.dp,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(size * 0.28f)
    Box(
        modifier = modifier
            .size(size)
            .shadow(10.dp, shape, clip = false)
            .clip(shape)
            .background(Color(0xFF3DDC84)),
        contentAlignment = Alignment.Center,
    ) {
        // Simple Android-bot mark (vector-ish via boxes)
        Box(
            modifier = Modifier
                .size(size * 0.55f)
                .clip(RoundedCornerShape(40))
                .background(Color(0xFF103B24)),
        )
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = size * 0.16f)
                .size(width = size * 0.34f, height = size * 0.08f)
                .clip(RoundedCornerShape(50))
                .background(Color(0xFF103B24)),
        )
    }
}
