# Registry API

## Overview

Registries store and manage game content like blocks, items, and entities.

## Creating a Registry

```java
Registry<String> items = new Registry<>("items");
items.register("my_mod:sword", "Diamond Sword");
items.register("my_mod:pickaxe", "Netherite Pickaxe");
items.freeze();
```

## Querying

```java
Registry<String> items = CrystiteAPI.getRegistry("items");

if (items.contains("my_mod:sword")) {
    String sword = items.get("my_mod:sword");
}

for (String id : items.getIds()) {
    System.out.println(id + " -> " + items.get(id));
}
```

## Naming Convention

Use `mod_id:entry_name` format:
- `minecraft:stone`
- `my_mod:custom_block`

## Built-in Registries

| Registry Name | Type | Description |
|--------------|------|-------------|
| `blocks` | Block | Game blocks |
| `items` | Item | Game items |
| `entities` | EntityType | Entity types |
| `recipes` | Recipe | Crafting recipes |
