package com.alexk.quantlauncher.ui.launchpad

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.alexk.quantlauncher.data.LaunchableApp
import com.alexk.quantlauncher.ui.icons.QuantAppIcon

@Composable
fun LaunchpadOverlay(
    apps: List<LaunchableApp>,
    query: String,
    onQueryChange: (String) -> Unit,
    onLaunchApp: (LaunchableApp) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0x99070A10))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onDismiss,
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 28.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            SearchField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier
                    .widthIn(max = 420.dp)
                    .fillMaxWidth(),
            )
            Spacer(Modifier = Modifier.height(18.dp))
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 92.dp),
                contentPadding = PaddingValues(bottom = 40.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(apps, key = { "${it.packageName}/${it.activityName}" }) { app ->
                    LaunchpadAppCell(
                        app = app,
                        onClick = { onLaunchApp(app) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0x66FFFFFF))
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = {},
            ),
    ) {
        if (value.isEmpty()) {
            Text(
                text = "Search",
                color = Color(0xCC1A1D24),
                fontSize = 16.sp,
            )
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = TextStyle(
                color = Color(0xFF111318),
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
            ),
            cursorBrush = SolidColor(Color(0xFF111318)),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun LaunchpadAppCell(
    app: LaunchableApp,
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(6.dp),
    ) {
        QuantAppIcon(
            drawable = app.icon,
            contentDescription = app.label,
            size = 64.dp,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = app.label,
            color = Color.White,
            fontSize = 12.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
