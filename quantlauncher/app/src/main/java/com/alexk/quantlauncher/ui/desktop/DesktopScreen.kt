package com.alexk.quantlauncher.ui.desktop

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier.modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.alexk.quantlauncher.ui.dock.MacDock
import com.alexk.quantlauncher.ui.launchpad.LaunchpadOverlay
import com.alexk.quantlauncher.ui.menubar.TopMenuBar

@Composable
fun DesktopScreen(
    viewModel: DesktopViewModel,
    modifier: Modifier = Modifier,
) {
    val state = viewModel.uiState

    Box(modifier = modifier.fillMaxSize()) {
        // Wallpaper comes from the system via windowShowWallpaper=true (transparent Compose root).

        TopMenuBar(
            modifier = Modifier
                .align(Alignment.TopStart)
                .statusBarsPadding(),
        )

        if (state.loading) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center),
                color = Color.White,
            )
        }

        MacDock(
            apps = state.dockApps,
            onLaunchpad = viewModel::openLaunchpad,
            onLaunchApp = viewModel::launchApp,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 18.dp),
        )

        if (state.launchpadOpen) {
            LaunchpadOverlay(
                apps = state.filteredApps,
                query = state.query,
                onQueryChange = viewModel::onQueryChange,
                onLaunchApp = viewModel::launchApp,
                onDismiss = viewModel::closeLaunchpad,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
