package com.futbobo.game;

import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tela acesa enquanto o jogador está numa sala do Bobonline.
 * O WebView do Android não tem a Screen Wake Lock API; aqui a flag
 * FLAG_KEEP_SCREEN_ON vai direto na janela da activity.
 * JS: registerPlugin("KeepAwake").set({ on: true | false }).
 */
@CapacitorPlugin(name = "KeepAwake")
public class KeepAwakePlugin extends Plugin {

    @PluginMethod
    public void set(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            JSObject result = new JSObject();
            result.put("on", on);
            call.resolve(result);
        });
    }
}
