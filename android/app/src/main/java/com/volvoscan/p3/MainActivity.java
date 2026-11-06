package com.volvoscan.p3;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static final int PERMISSION_REQ_CODE = 101;
    private WebView webView;
    private BluetoothBridge bluetoothBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        bluetoothBridge = new BluetoothBridge(this, webView);
        webView.addJavascriptInterface(bluetoothBridge, "AndroidBluetooth");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Inform web frontend that native Android Bluetooth bridge is active
                webView.evaluateJavascript("if (window.onNativeBridgeReady) window.onNativeBridgeReady();", null);
            }
        });

        checkAndRequestPermissions();
        webView.loadUrl("file:///android_asset/index.html");
    }

    private void checkAndRequestPermissions() {
        List<String> needed = new ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_SCAN);
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
            }
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQ_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQ_CODE) {
            if (webView != null) {
                webView.evaluateJavascript("if (window.onNativePermissionsUpdated) window.onNativePermissionsUpdated();", null);
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (bluetoothBridge != null) {
            bluetoothBridge.disconnect();
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
