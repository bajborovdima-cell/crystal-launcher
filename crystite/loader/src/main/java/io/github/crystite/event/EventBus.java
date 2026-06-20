package io.github.crystite.event;

import java.lang.reflect.Method;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

public class EventBus {
    private final Map<Class<?>, List<EventHandler>> listeners;

    public EventBus() {
        this.listeners = new ConcurrentHashMap<>();
    }

    public void register(Object listener) {
        for (Method method : listener.getClass().getDeclaredMethods()) {
            if (method.isAnnotationPresent(Subscribe.class)) {
                Class<?>[] params = method.getParameterTypes();
                if (params.length == 1 && Event.class.isAssignableFrom(params[0])) {
                    Subscribe annotation = method.getAnnotation(Subscribe.class);
                    registerListener((Class<? extends Event>) params[0], listener, method, annotation.priority());
                }
            }
        }
    }

    public void unregister(Object listener) {
        for (List<EventHandler> handlers : listeners.values()) {
            handlers.removeIf(h -> h.listener == listener);
        }
    }

    private void registerListener(Class<? extends Event> eventClass, Object listener,
                                   Method method, EventPriority priority) {
        listeners.computeIfAbsent(eventClass, k -> new CopyOnWriteArrayList<>())
                 .add(new EventHandler(listener, method, priority));
    }

    public void post(Event event) {
        Class<?> eventClass = event.getClass();
        List<EventHandler> handlers = listeners.get(eventClass);

        if (handlers == null) {
            return;
        }

        List<EventHandler> sortedHandlers = new ArrayList<>(handlers);
        sortedHandlers.sort(Comparator.comparingInt(h -> h.priority.ordinal()));

        for (EventHandler handler : sortedHandlers) {
            if (event.isCancelable() && event.isCancelled()) {
                break;
            }
            try {
                handler.method.setAccessible(true);
                handler.method.invoke(handler.listener, event);
            } catch (Exception e) {
                System.err.println("Error invoking event handler: " + e.getMessage());
            }
        }
    }

    private record EventHandler(Object listener, Method method, EventPriority priority) {}
}
