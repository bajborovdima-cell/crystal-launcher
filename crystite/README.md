# Crystite Mod Loader

A lightweight mod loader for Minecraft: Java Edition.

## Supported Versions

- **1.16.5**
- **1.20.1**
- **26.1.2** (Tiny Takeover)

## Building

```bash
./gradlew build
```

## Usage

```bash
java -javaagent:crystite-loader.jar -jar minecraft-server.jar
```

## Documentation

- [English](docs/en/getting-started.md)
- [Русский](docs/ru/getting-started.md)

## Project Structure

```
crystite/
├── loader/           # Core mod loader
├── launch-1165/      # 1.16.5 adapter
├── launch-1201/      # 1.20.1 adapter
├── launch-2612/      # 26.1.2 adapter
└── docs/             # Documentation
```
