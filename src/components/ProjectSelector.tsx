"use client";

import { useState } from "react";
import {
  listProjects,
  getActiveProject,
  setActiveProject,
  createProject,
  deleteProject,
} from "@/lib/storage";

interface ProjectSelectorProps {
  onProjectChange: (name: string) => void;
}

export default function ProjectSelector({ onProjectChange }: ProjectSelectorProps) {
  const [projects, setProjects] = useState(listProjects);
  const [active, setActive] = useState(getActiveProject);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  const handleSwitch = (name: string) => {
    setActiveProject(name);
    setActive(name);
    onProjectChange(name);
  };

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createProject(trimmed);
    setProjects(listProjects());
    setActive(trimmed);
    setNewName("");
    setShowNew(false);
    onProjectChange(trimmed);
  };

  const handleDelete = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete project "${name}"? This removes its shortlist data.`)) return;
    deleteProject(name);
    const updated = listProjects();
    setProjects(updated);
    const newActive = getActiveProject();
    setActive(newActive);
    if (newActive) onProjectChange(newActive);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {projects.map((p) => (
        <button
          key={p}
          onClick={() => handleSwitch(p)}
          className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
          style={{
            background: p === active ? "var(--accent)" : "var(--surface)",
            color: p === active ? "#fff" : "var(--text-primary)",
            border: "0.5px solid var(--border)",
          }}
        >
          {p}
          <span
            onClick={(e) => handleDelete(p, e)}
            className="opacity-0 group-hover:opacity-50 hover:!opacity-100 cursor-pointer"
            style={{ color: p === active ? "#fff" : "var(--text-tertiary)" }}
          >
            &times;
          </span>
        </button>
      ))}
      {showNew ? (
        <div className="inline-flex items-center gap-1">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setShowNew(false); setNewName(""); }
            }}
            placeholder="Project name"
            autoFocus
            className="px-2 py-1 rounded-lg text-xs w-36"
            style={{
              background: "var(--surface)",
              color: "var(--text-primary)",
              border: "0.5px solid var(--border)",
              outline: "none",
            }}
          />
          <button
            onClick={handleCreate}
            className="px-2 py-1 rounded-lg text-xs font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Create
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNew(true)}
          className="px-2 py-1.5 rounded-full text-xs font-medium transition-colors"
          style={{ background: "var(--surface)", color: "var(--text-secondary)", border: "0.5px solid var(--border)" }}
        >
          + New Project
        </button>
      )}
    </div>
  );
}
