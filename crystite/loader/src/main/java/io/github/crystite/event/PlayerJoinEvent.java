package io.github.crystite.event;

public class PlayerJoinEvent extends Event {
    private final String playerName;
    private final String playerUuid;

    public PlayerJoinEvent(String playerName, String playerUuid) {
        this.playerName = playerName;
        this.playerUuid = playerUuid;
    }

    public String getPlayerName() { return playerName; }
    public String getPlayerUuid() { return playerUuid; }
}
