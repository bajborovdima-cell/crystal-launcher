package io.github.crystite.event;

public class PlayerLeaveEvent extends Event {
    private final String playerName;
    private final String playerUuid;

    public PlayerLeaveEvent(String playerName, String playerUuid) {
        this.playerName = playerName;
        this.playerUuid = playerUuid;
    }

    public String getPlayerName() { return playerName; }
    public String getPlayerUuid() { return playerUuid; }
}
