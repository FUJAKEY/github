import { useState } from 'react';
import { TreeNode } from '../store/repo.ts';
import { FolderIcon, FolderOpenIcon, DocumentIcon } from '@heroicons/react/24/outline';

interface RepoTreeProps {
  nodes: TreeNode[];
  selectedPath?: string;
  onSelect: (path: string) => void;
}

export function RepoTree({ nodes, selectedPath, onSelect }: RepoTreeProps) {
  return (
    <ul className="space-y-1 text-sm">
      {nodes.map((node) => (
        <TreeNodeItem key={node.path} node={node} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </ul>
  );
}

function TreeNodeItem({ node, selectedPath, onSelect }: { node: TreeNode; selectedPath?: string; onSelect: (path: string) => void }) {
  const [open, setOpen] = useState(true);
  const isActive = selectedPath === node.path;

  if (node.type === 'dir') {
    return (
      <li>
        <button
          onClick={() => setOpen((prev) => !prev)}
          className={`flex w-full items-center gap-2 rounded-xl px-2 py-1 text-left font-medium ${isActive ? 'bg-primary/10 text-primary dark:text-primary-dark' : 'hover:bg-slate-200/50 dark:hover:bg-slate-800/60'}`}
        >
          {open ? <FolderOpenIcon className="h-4 w-4" /> : <FolderIcon className="h-4 w-4" />}
          {node.name}
        </button>
        {open && node.children && node.children.length > 0 && (
          <div className="ml-4 mt-1 border-l border-slate-200 pl-2 dark:border-slate-800">
            <RepoTree nodes={node.children} selectedPath={selectedPath} onSelect={onSelect} />
          </div>
        )}
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={() => onSelect(node.path)}
        className={`flex w-full items-center gap-2 rounded-xl px-2 py-1 text-left ${isActive ? 'bg-primary text-white shadow' : 'hover:bg-slate-200/60 dark:hover:bg-slate-800/60'}`}
      >
        <DocumentIcon className="h-4 w-4" />
        {node.name}
      </button>
    </li>
  );
}
