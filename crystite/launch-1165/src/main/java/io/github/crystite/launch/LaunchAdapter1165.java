package io.github.crystite.launch;

import io.github.crystite.launcher.LaunchAdapter;

import java.lang.reflect.Method;

public class LaunchAdapter1165 implements LaunchAdapter {

    @Override
    public void launch(String[] args) throws Exception {
        Class<?> mainClass = Class.forName("net.minecraft.client.main.Main");
        Method main = mainClass.getMethod("main", String[].class);
        main.invoke(null, (Object) args);
    }

    @Override
    public String getMinecraftVersion() {
        return "1.16.5";
    }

    @Override
    public String getCrystiteVersion() {
        return "1.0.0";
    }
}
