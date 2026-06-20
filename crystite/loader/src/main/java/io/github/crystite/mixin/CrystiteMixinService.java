package io.github.crystite.mixin;

import org.spongepowered.asm.launch.platform.IMixinPlatformAgent;
import org.spongepowered.asm.launch.platform.MixinPlatformManager;
import org.spongepowered.asm.service.*;
import org.spongepowered.asm.util.IConsumer;

import java.io.InputStream;
import java.util.*;

public class CrystiteMixinService implements IMixinService {
    private final MixinPlatformManager platformManager;

    public CrystiteMixinService() {
        this.platformManager = new MixinPlatformManager();
    }

    @Override
    public String getName() {
        return "Crystite";
    }

    @Override
    public boolean isValid() {
        return true;
    }

    @Override
    public void prepare() {
        platformManager.prepare(Arrays.asList(getClass()));
    }

    @Override
    public MixinPlatformManager getPlatformManager() {
        return platformManager;
    }

    @Override
    public void init() {
        platformManager.init();
    }

    @Override
    public InputStream getResourceAsStream(String name) {
        return getClass().getClassLoader().getResourceAsStream(name);
    }

    @Override
    public IClassProvider getClassProvider() {
        return new IClassProvider() {
            @Override
            public Class<?> findClass(String name) throws ClassNotFoundException {
                return Class.forName(name, true, Thread.currentThread().getContextClassLoader());
            }

            @Override
            public Class<?> findClass(String name, boolean initialize) throws ClassNotFoundException {
                return Class.forName(name, initialize, Thread.currentThread().getContextClassLoader());
            }

            @Override
            public Class<?> findAgentClass(String name, boolean initialize) throws ClassNotFoundException {
                return Class.forName(name, initialize, getClass().getClassLoader());
            }
        };
    }

    @Override
    public IClassBytecodeProvider getBytecodeProvider() {
        return className -> getResourceAsStream(className.replace('.', '/') + ".class");
    }

    @Override
    public ITransformerProvider getTransformerProvider() {
        return null;
    }

    @Override
    public Collection<String> getPlatformAgents() {
        return Collections.singletonList("org.spongepowered.asm.launch.platform.MixinPlatformAgentDefault");
    }

    @Override
    public IConsumer<MixinPlatformAgent> getAgentDelegate() {
        return null;
    }

    @Override
    public void registerInvalidClass(String className) {
    }

    @Override
    public boolean isClassLoaded(String className) {
        return false;
    }

    @Override
    public String getSideName() {
        return "SERVER";
    }
}
