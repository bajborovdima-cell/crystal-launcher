plugins {
    id("java")
}

group = "com.example"
version = "1.0.0"

repositories {
    mavenCentral()
    maven("https://maven.fabricmc.net")
    maven("https://repo.spongepowered.org/maven")
}

dependencies {
    implementation(files("../../loader/build/libs/loader-1.0.0.jar"))
    implementation("org.spongepowered:mixin:0.8.7")
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
}

task packageMod(type: Jar) {
    archiveFileName.set("example-mod-${version}.jar")
    destinationDirectory.set(file("../../mods"))
    from(sourceSets.main.get().output)
    from(sourceSets.main.get().resources)
}
