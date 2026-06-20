package io.github.crystite.mixin;

import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.*;
import org.spongepowered.asm.mixin.MixinEnvironment;
import org.spongepowered.asm.mixin.transformer.IMixinTransformer;
import org.spongepowered.asm.service.IMixinService;
import org.spongepowered.asm.service.ITransformer;

import java.lang.instrument.ClassFileTransformer;
import java.security.ProtectionDomain;
import java.util.*;

public class CrystiteClassTransformer implements ClassFileTransformer {
    private final List<MixinConfig> mixinConfigs;
    private final Map<String, byte[]> transformedClasses;

    public CrystiteClassTransformer() {
        this.mixinConfigs = new ArrayList<>();
        this.transformedClasses = new HashMap<>();
    }

    public void registerMixinConfig(String configPath, ClassLoader classLoader) {
        mixinConfigs.add(new MixinConfig(configPath, classLoader));
    }

    @Override
    public byte[] transform(ClassLoader loader, String className,
                            Class<?> classBeingRedefined,
                            ProtectionDomain protectionDomain,
                            byte[] classfileBuffer) {
        if (className == null || classfileBuffer == null) {
            return null;
        }

        String internalName = className.replace('.', '/');
        List<MixinConfig> applicableConfigs = new ArrayList<>();

        for (MixinConfig config : mixinConfigs) {
            if (config.appliesTo(internalName)) {
                applicableConfigs.add(config);
            }
        }

        if (applicableConfigs.isEmpty()) {
            return null;
        }

        try {
            ClassReader reader = new ClassReader(classfileBuffer);
            ClassNode classNode = new ClassNode();
            reader.accept(classNode, ClassReader.EXPAND_FRAMES);

            for (MixinConfig config : applicableConfigs) {
                config.apply(className, classNode);
            }

            ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS | ClassWriter.COMPUTE_FRAMES);
            classNode.accept(writer);
            byte[] result = writer.toByteArray();
            transformedClasses.put(className, result);
            return result;

        } catch (Exception e) {
            System.err.println("Failed to transform class " + className + ": " + e.getMessage());
            return null;
        }
    }

    public byte[] getTransformedClass(String className) {
        return transformedClasses.get(className);
    }

    private static class MixinConfig {
        final String configPath;
        final ClassLoader classLoader;
        final List<String> targetClasses;

        MixinConfig(String configPath, ClassLoader classLoader) {
            this.configPath = configPath;
            this.classLoader = classLoader;
            this.targetClasses = new ArrayList<>();
        }

        boolean appliesTo(String internalName) {
            return false;
        }

        void apply(String className, ClassNode classNode) {
        }
    }
}
