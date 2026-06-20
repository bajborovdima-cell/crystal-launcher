package io.github.crystite.launcher;

import io.github.crystite.loader.CrystiteModLoader;
import io.github.crystite.mixin.CrystiteClassTransformer;

import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;

public class CrystiteLauncher {
    private static final String VERSION = "1.0.0";

    public static void premain(String args, Instrumentation instrumentation) {
        System.out.println("Crystite Mod Loader " + VERSION + " initializing...");

        CrystiteClassTransformer transformer = new CrystiteClassTransformer();
        instrumentation.addTransformer(transformer, true);

        CrystiteModLoader.getInstance().getClassTransformer();
    }

    public static void main(String[] args) {
        System.out.println("Crystite Mod Loader " + VERSION);
        System.out.println("Usage: java -javaagent:crystite-loader.jar -jar minecraft.jar");

        if (args.length == 0) {
            System.out.println("No launch adapter specified. Use -Dcrystite.version=<version>");
            return;
        }
    }

    public static String getVersion() { return VERSION; }
}
