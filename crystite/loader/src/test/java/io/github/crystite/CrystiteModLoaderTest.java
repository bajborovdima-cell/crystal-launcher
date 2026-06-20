package io.github.crystite;

import io.github.crystite.event.EventBus;
import io.github.crystite.event.ServerStartingEvent;
import io.github.crystite.event.Subscribe;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class CrystiteModLoaderTest {

    @Test
    public void testEventBus() {
        EventBus bus = new EventBus();
        TestListener listener = new TestListener();
        bus.register(listener);
        bus.post(new ServerStartingEvent());
        assertTrue(listener.called);
    }

    public static class TestListener {
        boolean called = false;

        @Subscribe
        public void onServerStart(ServerStartingEvent event) {
            called = true;
        }
    }
}
