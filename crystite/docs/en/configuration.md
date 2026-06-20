# Configuration

## Overview

Crystite uses `.properties` files for mod configuration.

## Basic Usage

```java
ConfigAPI config = new ConfigAPI("my_mod");

Properties props = config.load("settings");
String value = props.getProperty("key", "default");

props.setProperty("key", "newValue");
config.save("settings", props);
```

## Directory Structure

```
config/
  └── my_mod/
      └── settings.properties
```

## Example

```java
public class MyModConfig {
    private final ConfigAPI config;
    private int maxPlayers = 10;
    private boolean enableFeature = true;

    public MyModConfig() {
        this.config = new ConfigAPI("my_mod");
        load();
    }

    public void load() {
        Properties props = config.load("settings");
        maxPlayers = Integer.parseInt(props.getProperty("maxPlayers", "10"));
        enableFeature = Boolean.parseBoolean(props.getProperty("enableFeature", "true"));
    }

    public void save() {
        Properties props = new Properties();
        props.setProperty("maxPlayers", String.valueOf(maxPlayers));
        props.setProperty("enableFeature", String.valueOf(enableFeature));
        config.save("settings", props);
    }
}
```
