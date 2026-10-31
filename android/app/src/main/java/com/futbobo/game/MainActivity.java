package com.futbobo.game;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locais entram antes do super.onCreate (o Capacitor monta a ponte ali).
        registerPlugin(KeepAwakePlugin.class);
        super.onCreate(savedInstanceState);
        // Sem o @capacitor/app ninguém trata o voltar: no /bobonline ele vira o voltar do WebView (popstate), para as confirmações da sala e da partida; nas outras rotas segue o padrão do Android.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                String url = webView == null ? null : webView.getUrl();
                String path = url == null ? null : Uri.parse(url).getPath();
                if (webView != null && path != null && path.startsWith("/bobonline") && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
