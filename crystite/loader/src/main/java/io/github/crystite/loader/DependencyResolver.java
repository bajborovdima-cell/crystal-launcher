package io.github.crystite.loader;

import java.util.*;
import java.util.stream.Collectors;

public class DependencyResolver {
    private final List<ModContainer> mods;

    public DependencyResolver(List<ModContainer> mods) {
        this.mods = mods;
    }

    public List<ModContainer> resolveLoadOrder() {
        Map<String, ModContainer> modMap = new HashMap<>();
        for (ModContainer mod : mods) {
            modMap.put(mod.getMetadata().getId(), mod);
        }

        Map<String, Set<String>> graph = new HashMap<>();
        for (ModContainer mod : mods) {
            Set<String> deps = new HashSet<>();
            for (Map.Entry<String, String> dep : mod.getMetadata().getDepends().entrySet()) {
                if (modMap.containsKey(dep.getKey())) {
                    deps.add(dep.getKey());
                }
            }
            graph.put(mod.getMetadata().getId(), deps);
        }

        List<String> sorted = topologicalSort(graph);
        List<ModContainer> result = new ArrayList<>();
        for (String id : sorted) {
            ModContainer mod = modMap.get(id);
            if (mod != null) {
                result.add(mod);
            }
        }
        return result;
    }

    private List<String> topologicalSort(Map<String, Set<String>> graph) {
        List<String> sorted = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        Set<String> visiting = new HashSet<>();

        for (String node : graph.keySet()) {
            if (!visited.contains(node)) {
                if (!dfs(node, graph, visited, visiting, sorted)) {
                    throw new IllegalStateException("Circular dependency detected involving: " + node);
                }
            }
        }

        Collections.reverse(sorted);
        return sorted;
    }

    private boolean dfs(String node, Map<String, Set<String>> graph,
                        Set<String> visited, Set<String> visiting,
                        List<String> sorted) {
        visiting.add(node);
        for (String dep : graph.getOrDefault(node, Collections.emptySet())) {
            if (!visited.contains(dep)) {
                if (visiting.contains(dep)) {
                    return false;
                }
                if (!dfs(dep, graph, visited, visiting, sorted)) {
                    return false;
                }
            }
        }
        visiting.remove(node);
        visited.add(node);
        sorted.add(node);
        return true;
    }

    public boolean hasUnsatisfiedDependencies(ModContainer mod) {
        for (Map.Entry<String, String> dep : mod.getMetadata().getDepends().entrySet()) {
            boolean found = mods.stream().anyMatch(m ->
                m.getMetadata().getId().equals(dep.getKey()) &&
                satisfiesVersion(m.getMetadata().getVersion(), dep.getValue())
            );
            if (!found) {
                return true;
            }
        }
        return false;
    }

    private boolean satisfiesVersion(String actual, String required) {
        if (required == null || required.isEmpty()) {
            return true;
        }
        return actual != null && actual.equals(required);
    }
}
