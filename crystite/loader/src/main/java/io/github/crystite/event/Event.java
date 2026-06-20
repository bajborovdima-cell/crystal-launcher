package io.github.crystite.event;

public abstract class Event {
    private boolean cancelled;

    public boolean isCancelled() { return cancelled; }

    public void setCancelled(boolean cancelled) {
        if (!isCancelable()) {
            throw new UnsupportedOperationException("Event is not cancelable");
        }
        this.cancelled = cancelled;
    }

    public boolean isCancelable() { return false; }
}
