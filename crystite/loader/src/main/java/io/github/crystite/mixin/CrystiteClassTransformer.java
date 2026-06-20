package io.github.crystite.mixin;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.tree.ClassNode;
import org.spongepowered.asm.mixin.MixinEnvironment;
import org.spongepowered.asm.mixin.transformer.IMixinTransformer;
import org.spongepowered.asm.mixin.transformer.IMixinTransformerFactory;
import org.spongepowered.asm.service.IClassProvider;
import org.spongepowered.asm.service.IMixinService;
import org.spongepowered.asm.service.ITransformer;

import java.io.InputStream;
import java.lang.instrument.ClassFileTransformer;
import java.lang.reflect.Constructor;
import java.security.ProtectionDomain;
import java.util.*;

public class CrystiteClassTransformer implements ClassFileTransformer, ITransformer {
    private final Map<String, byte[]> transformedClasses;
    private final CrystiteMixinService mixinService;
    private IMixinTransformer mixinTransformer;

    public CrystiteClassTransformer() {
        this.transformedClasses = new HashMap<>();
        this.mixinService = new CrystiteMixinService();
        MixinEnvironment.getCurrentEnvironment().setActiveSource(IMixinService.class, mixinService);
    }

    public void initialize() {
        try {
            IMixinTransformerFactory factory = (IMixinTransformerFactory)
                Class.forName("org.spongepowered.asm.mixin.transformer.MixinTransformer")
                    .getDeclaredConstructor(IMixinService.class)
                    .newInstance(mixinService);
            this.mixinTransformer = factory.createTransformer();
        } catch (Exception e) {
            System.err.println("Failed to initialize Mixin transformer: " + e.getMessage());
        }
    }

    public void registerMixinConfig(String configPath, ClassLoader classLoader) {
        try {
            org.spongepowered.asm.mixin.Mixins.addConfiguration(configPath);
            System.out.println("Registered mixin config: " + configPath);
        } catch (Exception e) {
            System.err.println("Failed to register mixin config " + configPath + ": " + e.getMessage());
        }
    }

    @Override
    public byte[] transform(ClassLoader loader, String className,
                            Class<?> classBeingRedefined,
                            ProtectionDomain protectionDomain,
                            byte[] classfileBuffer) {
        if (className == null || classfileBuffer == null) {
            return null;
        }

        try {
            String name = className.replace('/', '.');
            byte[] result = classfileBuffer;

            if (mixinTransformer != null) {
                result = mixinTransformer.transformClass(name, name, result);
            }

            if (result != classfileBuffer) {
                transformedClasses.put(className, result);
            }

            return result != classfileBuffer ? result : null;

        } catch (Exception e) {
            return null;
        }
    }

    public byte[] getTransformedClass(String className) {
        return transformedClasses.get(className);
    }

    @Override
    public String getName() {
        return "CrystiteTransformer";
    }

    @Override
    public boolean isDelegationExcluded() {
        return false;
    }

    @Override
    public boolean isPreFilter() {
        return true;
    }
}
