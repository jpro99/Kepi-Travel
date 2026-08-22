package com.kepitravel.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KepiLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
