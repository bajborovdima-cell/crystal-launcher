package io.github.crystite.event;

public class ServerTickEvent extends Event {
    private final long tickCount;

    public ServerTickEvent(long tickCount) {
        this.tickCount = tickCount;
    }

    public long getTickCount() { return tickCount; }
}
