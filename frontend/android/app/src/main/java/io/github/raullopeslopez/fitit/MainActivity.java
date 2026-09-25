package io.github.raullopeslopez.fitit;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import io.github.raullopeslopez.fitit.session.SessionPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios (no vienen de npm) se registran a mano, antes de
        // que arranque el puente.
        registerPlugin(SessionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
