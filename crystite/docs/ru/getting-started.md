# Crystite Mod Loader — Документация

## Начало работы

### Что такое Crystite?

Crystite — это загрузчик модов для Minecraft: Java Edition. Он позволяет загружать моды, которые изменяют игру с помощью:
- **Mixin** — трансформация байткода для изменения классов Minecraft во время выполнения
- **Система событий** — подписка на игровые события (запуск сервера, тики и т.д.)
- **Registry API** — регистрация блоков, предметов и другого контента
- **Configuration API** — сохранение и загрузка настроек модов

### Установка

1. **Скачайте Crystite** — соберите из исходников или скачайте последний релиз
2. **Создайте папку `mods/`** в директории Minecraft
3. **Запустите с Crystite:**
   ```bash
   java -javaagent:crystite-loader.jar -jar minecraft-server.jar
   ```
   Или для клиента:
   ```bash
   java -javaagent:crystite-loader.jar -cp minecraft-client.jar net.minecraft.client.main.Main
   ```

### Проверка установки

При успешной загрузке Crystite вы увидите:
```
Crystite Mod Loader 1.0.0 initializing...
Crystite Mod Loader initialized with 0 mod(s)
```

### Создание папки модов

Поместите `.jar` файлы модов в папку `mods/` рядом с Minecraft jar.

---

## Первый мод

### Требования

- Java 17+ (Java 25+ для Minecraft 26.1.2)
- Gradle или Maven
- Базовые знания Java

### Настройка проекта

Создайте новый Gradle проект:

**build.gradle.kts:**
```kotlin
plugins {
    id("java")
}

repositories {
    mavenCentral()
    maven("https://maven.fabricmc.net")
}

dependencies {
    implementation("io.github.crystite:crystite-api:1.0.0")
}
```

### Создайте `crystite.mod.json`

Поместите этот файл в `src/main/resources/`:

```json
{
    "id": "example-mod",
    "version": "1.0.0",
    "name": "Example Mod",
    "description": "Мой первый мод для Crystite",
    "authors": ["ВашеИмя"],
    "entrypoints": {
        "main": "com.example.ExampleMod"
    },
    "license": "MIT"
}
```

### Создайте класс мода

```java
package com.example;

import io.github.crystite.api.Entrypoint;
import io.github.crystite.api.ModInitializer;
import io.github.crystite.event.EventBus;
import io.github.crystite.event.ServerStartingEvent;
import io.github.crystite.event.Subscribe;

@Entrypoint
public class ExampleMod implements ModInitializer {

    @Override
    public void onInitialize(EventBus eventBus) {
        System.out.println("Привет от Example Mod!");
        eventBus.register(this);
    }

    @Subscribe
    public void onServerStart(ServerStartingEvent event) {
        System.out.println("Сервер запускается! - Example Mod");
    }
}
```

### Сборка мода

```bash
./gradlew build
```

Ваш мод будет в `build/libs/example-mod-1.0.0.jar`. Поместите его в папку `mods/`.

### Тестирование

Запустите Minecraft с Crystite и проверьте консоль:
```
Привет от Example Mod!
Сервер запускается! - Example Mod
```

---

## Руководство по Mixin

### Что такое Mixin?

Mixin позволяют внедрять код в существующие классы Minecraft без изменения исходных файлов. Crystite использует SpongePowered Mixin.

### Конфигурация Mixin

Создайте файл конфигурации в `src/main/resources/` (например, `example-mod.mixin.json`):

```json
{
    "required": true,
    "package": "com.example.mixin",
    "compatibilityLevel": "JAVA_17",
    "mixins": ["ExampleMixin"],
    "client": [],
    "server": []
}
```

Зарегистрируйте его в `crystite.mod.json`:
```json
{
    "id": "example-mod",
    "mixins": ["example-mod.mixin.json"]
}
```

### Создание Mixin

```java
package com.example.mixin;

import net.minecraft.server.MinecraftServer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MinecraftServer.class)
public class ExampleMixin {

    @Inject(at = @At("HEAD"), method = "runServer")
    private void onRunServer(CallbackInfo info) {
        System.out.println("Mixin: MinecraftServer.runServer() вызван!");
    }
}
```

### Аннотации Mixin

| Аннотация | Назначение |
|-----------|-----------|
| `@Inject` | Внедрить код в определённую точку метода |
| `@Overwrite` | Полностью заменить метод |
| `@Redirect` | Перенаправить вызов метода на свой |
| `@Accessor` | Получить доступ к private полям |
| `@ModifyArg` | Изменить аргумент, переданный в метод |
| `@ModifyVariable` | Изменить локальную переменную |
| `@Shadow` | Доступ к private полям/методам |

### Пример @Inject

```java
// Внедрение в начало метода
@Inject(at = @At("HEAD"), method = "tick")

// Внедрение в конец метода
@Inject(at = @At("RETURN"), method = "tick")

// С возможностью отмены
@Inject(at = @At("HEAD"), method = "someMethod", cancellable = true)
```

### Пример @Accessor

```java
@Mixin(MinecraftServer.class)
public interface ServerAccessor {

    @Accessor("tickCount")
    int getTickCount();
}
```

### Отладка Mixin

```bash
-Dmixin.debug=true -Dmixin.dumpTargetOnFailure=true
```

---

## Система событий

### Обзор

Моды подписываются на игровые события через `@Subscribe`. События публикуются игрой или другими модами.

### Доступные события

| Событие | Когда срабатывает |
|---------|------------------|
| `ServerStartingEvent` | Сервер начинает загрузку |
| `ServerStartedEvent` | Сервер полностью запущен |
| `ServerStoppingEvent` | Сервер начинает остановку |
| `ClientStartingEvent` | Клиент запускается |
| `PlayerJoinEvent` | Игрок заходит на сервер |
| `PlayerLeaveEvent` | Игрок покидает сервер |

### Подписка на события

```java
@Subscribe
public void onServerStart(ServerStartingEvent event) {
    System.out.println("Сервер загружается!");
}

@Subscribe(priority = EventPriority.HIGH)
public void onPlayerJoin(PlayerJoinEvent event) {
    System.out.println("Игрок зашёл: " + event.getPlayerName());
}
```

### Приоритеты

1. `HIGHEST` (наивысший)
2. `HIGH`
3. `NORMAL` (по умолчанию)
4. `LOW`
5. `LOWEST` (наинизший)

### Создание своих событий

```java
public class MyEvent extends Event {
    private final String data;
    public MyEvent(String data) { this.data = data; }
    public String getData() { return data; }
}

// Публикация:
EventBus bus = CrystiteModLoader.getInstance().getEventBus();
bus.post(new MyEvent("привет"));
```

### Отменяемые события

```java
public class MyEvent extends Event {
    @Override
    public boolean isCancelable() { return true; }
}
```

---

## Registry API

### Обзор

Реестры хранят и управляют игровым контентом: блоками, предметами, сущностями.

### Создание реестра

```java
Registry<String> items = new Registry<>("items");
items.register("my_mod:sword", "Алмазный меч");
items.register("my_mod:pickaxe", "Незеритовая кирка");
items.freeze();
```

### Поиск в реестре

```java
Registry<String> items = CrystiteAPI.getRegistry("items");

if (items.contains("my_mod:sword")) {
    String sword = items.get("my_mod:sword");
}

for (String id : items.getIds()) {
    System.out.println(id + " -> " + items.get(id));
}
```

### Соглашение об именах

Формат `mod_id:entry_name`:
- `minecraft:stone` (камень)
- `my_mod:custom_block` (мой_блок)

### Встроенные реестры

| Имя реестра | Тип | Описание |
|------------|-----|----------|
| `blocks` | Block | Игровые блоки |
| `items` | Item | Игровые предметы |
| `entities` | EntityType | Типы сущностей |
| `recipes` | Recipe | Рецепты крафта |

---

## Конфигурация

### Обзор

Crystite использует `.properties` файлы для конфигурации модов.

### Базовое использование

```java
ConfigAPI config = new ConfigAPI("my_mod");

Properties props = config.load("settings");
String value = props.getProperty("key", "значение_по_умолчанию");

props.setProperty("key", "новое_значение");
config.save("settings", props);
```

### Структура директории

```
config/
  └── my_mod/
      └── settings.properties
```

### Пример

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

---

## Команды

### Обзор

Crystite интегрируется с командной системой Brigadier от Minecraft.

### Регистрация команды

```java
import com.mojang.brigadier.CommandDispatcher;
import net.minecraft.server.command.ServerCommandSource;
import static net.minecraft.server.command.CommandManager.*;

public class MyCommands {

    public static void register(CommandDispatcher<ServerCommandSource> dispatcher) {
        dispatcher.register(
            literal("привет")
                .executes(ctx -> {
                    ctx.getSource().sendMessage(Text.literal("Здравствуйте!"));
                    return 1;
                })
        );
    }
}
```

### Команды с аргументами

```java
dispatcher.register(
    literal("телепорт")
        .then(argument("цель", EntityArgumentType.player())
            .executes(ctx -> {
                ServerPlayerEntity player = EntityArgumentType.getPlayer(ctx, "цель");
                ctx.getSource().sendMessage(Text.literal("Телепортирую " + player.getName()));
                return 1;
            })
        )
);
```

### Регистрация при запуске

```java
@Subscribe
public void onServerStart(ServerStartingEvent event) {
    MyCommands.register(
        CrystiteModLoader.getInstance().getCommandDispatcher()
    );
}
```

---

## Зависимости

### Обзор

Моды могут объявлять зависимости от других модов в `crystite.mod.json`.

### Объявление зависимостей

```json
{
    "id": "my-mod",
    "version": "1.0.0",
    "depends": {
        "core-library": "1.0.0",
        "another-mod": "2.0.0"
    }
}
```

### Как это работает

1. Все моды обнаруживаются из папки `mods/`
2. Зависимости анализируются через DependencyResolver
3. Моды сортируются с помощью топологической сортировки
4. Циклические зависимости вызывают ошибки
5. Отсутствующие зависимости логируются

### Рекомендуемые моды

```json
{
    "depends": {},
    "suggests": {
        "optional-addon": "1.0.0"
    }
}
```

### Сравнение версий

В текущей версии сравнение версий точное. Будущие версии будут поддерживать semver-диапазоны.

---

## Решение проблем

### Мод не загружается

- Проверьте, существует ли папка `mods/`
- Убедитесь, что `crystite.mod.json` находится в корне JAR
- Проверьте синтаксис JSON
- Проверьте консоль на сообщения об ошибках

### Ошибки Mixin

```
Mixin apply failed for example.mixin.ExampleMixin
```

- Проверьте, что JSON конфигурации Mixin валиден
- Убедитесь, что имя целевого класса правильное
- Включите отладку: `-Dmixin.debug=true`

### ClassNotFoundException

```
java.lang.ClassNotFoundException: com.example.ExampleMod
```

- Проверьте имя класса entrypoint в `crystite.mod.json`
- Убедитесь, что класс существует в JAR
- Проверьте, что package соответствует пути

### Версия Java

- Minecraft 1.16.5: Java 8+
- Minecraft 1.20.1: Java 17+
- Minecraft 26.1.2: Java 25+

### Режим отладки

```bash
java -Dcrystite.debug=true -javaagent:crystite-loader.jar -jar minecraft.jar
```

### Логи

Проверьте `logs/crystite.log` для детальной информации.

### Частые ошибки

| Ошибка | Причина |
|--------|---------|
| `NoClassDefFoundError` | Отсутствует JAR зависимости |
| `NullPointerException` | Мод использует неинициализированное API |
| `MixinApplyError` | Цель Mixin изменилась или не существует |
| `UnsupportedClassVersionError` | Неправильная версия Java |
