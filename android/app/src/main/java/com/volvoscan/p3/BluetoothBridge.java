package com.volvoscan.p3;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

public class BluetoothBridge {
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final Context context;
    private final WebView webView;
    private final BluetoothAdapter bluetoothAdapter;
    private BluetoothSocket socket;
    private InputStream inputStream;
    private OutputStream outputStream;
    private boolean isConnected = false;
    private String connectedDeviceName = "";

    public BluetoothBridge(Context context, WebView webView) {
        this.context = context;
        this.webView = webView;
        this.bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
    }

    @JavascriptInterface
    public String getPairedDevices() {
        JSONArray array = new JSONArray();
        try {
            if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
                return array.toString();
            }
            Set<BluetoothDevice> paired = bluetoothAdapter.getBondedDevices();
            if (paired != null) {
                for (BluetoothDevice device : paired) {
                    JSONObject obj = new JSONObject();
                    obj.put("name", device.getName() != null ? device.getName() : "Неизвестное устройство");
                    obj.put("address", device.getAddress());
                    array.put(obj);
                }
            }
        } catch (SecurityException se) {
            return "ERR_PERMISSION";
        } catch (Exception e) {
            e.printStackTrace();
        }
        return array.toString();
    }

    @JavascriptInterface
    public boolean isBluetoothEnabled() {
        return bluetoothAdapter != null && bluetoothAdapter.isEnabled();
    }

    @JavascriptInterface
    public boolean isConnected() {
        return isConnected && socket != null && socket.isConnected();
    }

    @JavascriptInterface
    public String getConnectedDeviceName() {
        return connectedDeviceName;
    }

    @JavascriptInterface
    public String connect(String macAddress) {
        try {
            disconnect();
            if (bluetoothAdapter == null) {
                return "ERR: Bluetooth не поддерживается данным телефоном";
            }
            if (!bluetoothAdapter.isEnabled()) {
                return "ERR: Bluetooth выключен. Включите Bluetooth";
            }

            BluetoothDevice device = bluetoothAdapter.getRemoteDevice(macAddress);
            connectedDeviceName = device.getName() != null ? device.getName() : macAddress;

            try {
                bluetoothAdapter.cancelDiscovery();
            } catch (SecurityException ignored) {}

            socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
            socket.connect();

            inputStream = socket.getInputStream();
            outputStream = socket.getOutputStream();
            isConnected = true;

            // Initialize ELM327 with Volvo P3 standard protocol commands
            sendRaw("ATZ\r");
            Thread.sleep(600);
            sendRaw("ATE0\r");
            Thread.sleep(150);
            sendRaw("ATL0\r");
            Thread.sleep(150);
            sendRaw("ATH1\r");
            Thread.sleep(150);
            sendRaw("ATSP6\r");
            Thread.sleep(200);
            sendRaw("ATCAF1\r");
            Thread.sleep(150);

            return "OK:" + connectedDeviceName;
        } catch (SecurityException se) {
            disconnect();
            return "ERR: Нет разрешения на Bluetooth в системе";
        } catch (Exception e) {
            disconnect();
            return "ERR: " + (e.getMessage() != null ? e.getMessage() : "Ошибка подключения к адаптеру");
        }
    }

    @JavascriptInterface
    public void disconnect() {
        isConnected = false;
        try {
            if (inputStream != null) inputStream.close();
            if (outputStream != null) outputStream.close();
            if (socket != null) socket.close();
        } catch (Exception ignored) {}
        socket = null;
        inputStream = null;
        outputStream = null;
        connectedDeviceName = "";
    }

    @JavascriptInterface
    public String sendCommand(String cmd) {
        if (!isConnected || socket == null || outputStream == null || inputStream == null) {
            return "ERR: Не подключено к адаптеру";
        }
        try {
            // Drain remaining input buffer
            while (inputStream.available() > 0) {
                inputStream.read();
            }

            // Write command terminated with CR
            outputStream.write((cmd.trim() + "\r").getBytes("US-ASCII"));
            outputStream.flush();

            // Read response until '>' prompt
            StringBuilder response = new StringBuilder();
            long startTime = System.currentTimeMillis();
            long timeoutMs = 2500;

            while (System.currentTimeMillis() - startTime < timeoutMs) {
                if (inputStream.available() > 0) {
                    int b = inputStream.read();
                    if (b == -1) break;
                    char c = (char) b;
                    if (c == '>') {
                        break;
                    }
                    if (c != '\r') {
                        response.append(c);
                    }
                } else {
                    Thread.sleep(10);
                }
            }

            return response.toString().trim();
        } catch (Exception e) {
            return "ERR: " + e.getMessage();
        }
    }

    private void sendRaw(String raw) {
        try {
            if (outputStream != null) {
                outputStream.write(raw.getBytes("US-ASCII"));
                outputStream.flush();
                Thread.sleep(100);
                if (inputStream != null) {
                    while (inputStream.available() > 0) {
                        inputStream.read();
                    }
                }
            }
        } catch (Exception ignored) {}
    }
}
