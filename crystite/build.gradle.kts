plugins {
    id("java")
    id("java-library")
    id("maven-publish")
}

group = "io.github.crystite"
version = "1.0.0"

allprojects {
    group = rootProject.group
    version = rootProject.version

    repositories {
        mavenCentral()
        maven("https://maven.fabricmc.net")
        maven("https://repo.spongepowered.org/maven")
    }
}

subprojects {
    apply(plugin = "java")
    apply(plugin = "java-library")

    java {
        withSourcesJar()
    }

    tasks.withType<JavaCompile> {
        options.encoding = "UTF-8"
    }
}
