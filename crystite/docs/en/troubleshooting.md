# Troubleshooting

## Mod Not Loading

- Verify `mods/` folder exists
- Check `crystite.mod.json` is at the root of your JAR
- Validate JSON syntax
- Check console for error messages

## Mixin Failures

```
Mixin apply failed for example.mixin.ExampleMixin
```

- Verify mixin config JSON is valid
- Ensure target class name is correct
- Enable debug: `-Dmixin.debug=true`

## ClassNotFoundException

```
java.lang.ClassNotFoundException: com.example.ExampleMod
```

- Check entrypoint class name in `crystite.mod.json`
- Verify class exists in the JAR
- Check package declaration matches path

## Java Version

- Minecraft 1.16.5: Java 8+
- Minecraft 1.20.1: Java 17+
- Minecraft 26.1.2: Java 25+

## Debug Mode

```bash
java -Dcrystite.debug=true -javaagent:crystite-loader.jar -jar minecraft.jar
```

## Logs

Check `logs/crystite.log` for detailed information.

## Common Errors

| Error | Cause |
|-------|-------|
| `NoClassDefFoundError` | Missing dependency JAR |
| `NullPointerException` | Mod tried to use uninitialized API |
| `MixinApplyError` | Mixin target changed or doesn't exist |
| `UnsupportedClassVersionError` | Wrong Java version |
