package com.runeditrun.easel;

import android.app.Application;

/** Financial state and credentials live only in this process. */
public final class EaselApplication extends Application {
    public final Session session = new Session();
    @Override public void onCreate() {
        super.onCreate();
        // The provider is disabled: only this installation's supplied client metadata initializes Firebase.
        PushRegistration.configured(this);
    }
}
