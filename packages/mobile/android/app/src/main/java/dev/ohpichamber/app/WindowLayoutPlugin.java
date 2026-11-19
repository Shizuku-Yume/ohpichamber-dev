package dev.ohpichamber.app;

import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.view.View;
import androidx.core.graphics.ColorUtils;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reports edge-to-edge enforcement and native-inset status-bar contrast.
 *
 * The app targets SDK 35, so Android 15 and newer always draw it under the system bars,
 * while older versions honour StatusBar.setOverlaysWebView({ overlay: false }). The page
 * cannot read the OS version itself: hardened WebViews such as GrapheneOS's Vanadium send
 * the reduced "Android 10; K" user agent on every release.
 */
@CapacitorPlugin(name = "WindowLayout")
public class WindowLayoutPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            boolean edgeToEdge = Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM;
            JSObject result = new JSObject();
            result.put("edgeToEdge", edgeToEdge);
            View decorView = getActivity().getWindow().getDecorView();
            // SystemBars pads the native view when WebView cannot supply safe-area insets.
            if (edgeToEdge && decorView.getPaddingTop() > 0) {
                Drawable background = decorView.getBackground();
                String style = "DEFAULT";
                if (background instanceof ColorDrawable) {
                    int color = ((ColorDrawable) background).getColor();
                    style = ColorUtils.calculateLuminance(color) > 0.5 ? "LIGHT" : "DARK";
                }
                result.put("statusBarStyle", style);
            }
            call.resolve(result);
        });
    }
}
