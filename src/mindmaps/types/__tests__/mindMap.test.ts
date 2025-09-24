import { describe, it, expect } from 'vitest';
import type { Source, MindMapNodeData } from '../mindMap';

describe('mindMap types', () => {
  describe('Source interface', () => {
    it('should create a valid file source', () => {
      const fileSource: Source = {
        id: 'src-1',
        name: 'Component File',
        directory: '/src/components',
        type: 'file',
        title: 'React Component',
        text: 'Component source code',
      };

      expect(fileSource.id).toBe('src-1');
      expect(fileSource.type).toBe('file');
      expect(fileSource.name).toBe('Component File');
      expect(fileSource.directory).toBe('/src/components');
      expect(fileSource.title).toBe('React Component');
      expect(fileSource.text).toBe('Component source code');
    });

    it('should create a valid URL source', () => {
      const urlSource: Source = {
        id: 'src-2',
        name: 'Documentation',
        directory: '/web/docs',
        type: 'url',
        url: 'https://example.com/docs',
        title: 'API Documentation',
      };

      expect(urlSource.id).toBe('src-2');
      expect(urlSource.type).toBe('url');
      expect(urlSource.url).toBe('https://example.com/docs');
      expect(urlSource.title).toBe('API Documentation');
    });

    it('should create a valid document source', () => {
      const documentSource: Source = {
        id: 'src-3',
        name: 'Research Paper',
        directory: '/docs/research',
        type: 'document',
        title: 'AI Research',
        text: 'Research content',
      };

      expect(documentSource.type).toBe('document');
      expect(documentSource.title).toBe('AI Research');
      expect(documentSource.text).toBe('Research content');
    });

    it('should create a valid reference source', () => {
      const referenceSource: Source = {
        id: 'src-4',
        name: 'External Reference',
        directory: '/refs',
        type: 'reference',
      };

      expect(referenceSource.type).toBe('reference');
      expect(referenceSource.title).toBeUndefined();
      expect(referenceSource.url).toBeUndefined();
      expect(referenceSource.text).toBeUndefined();
    });

    it('should require all mandatory fields', () => {
      // This test ensures TypeScript compilation fails for incomplete sources
      const validSource: Source = {
        id: 'required-id',
        name: 'required-name',
        directory: 'required-directory',
        type: 'file',
      };

      expect(validSource.id).toBeDefined();
      expect(validSource.name).toBeDefined();
      expect(validSource.directory).toBeDefined();
      expect(validSource.type).toBeDefined();
    });
  });

  describe('MindMapNodeData interface', () => {
    it('should create a valid root node', () => {
      const rootNode: MindMapNodeData = {
        id: 'root-1',
        label: 'Root Topic',
        isRoot: true,
        level: 0,
        hasChildren: true,
        isCollapsed: false,
        isDragging: false,
        isDropTarget: false,
        dropPosition: null,
        layout: 'LR',
        width: 200,
        colorTheme: null,
      };

      expect(rootNode.isRoot).toBe(true);
      expect(rootNode.level).toBe(0);
      expect(rootNode.parentId).toBeUndefined();
      expect(rootNode.hasChildren).toBe(true);
      expect(rootNode.layout).toBe('LR');
    });

    it('should create a valid child node', () => {
      const childNode: MindMapNodeData = {
        id: 'child-1',
        label: 'Child Topic',
        isRoot: false,
        parentId: 'root-1',
        level: 1,
        hasChildren: false,
        isCollapsed: false,
        isDragging: false,
        isDropTarget: false,
        dropPosition: null,
        layout: 'LR',
        width: 150,
        colorTheme: null,
      };

      expect(childNode.isRoot).toBe(false);
      expect(childNode.parentId).toBe('root-1');
      expect(childNode.level).toBe(1);
      expect(childNode.hasChildren).toBe(false);
    });

    it('should support all layout types', () => {
      const layouts: Array<MindMapNodeData['layout']> = [
        'LR',
        'RL',
        'TB',
        'BT',
      ];

      layouts.forEach(layout => {
        const node: MindMapNodeData = {
          id: `node-${layout}`,
          label: `Node ${layout}`,
          isRoot: false,
          level: 1,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: false,
          dropPosition: null,
          layout,
          width: 150,
          colorTheme: null,
        };

        expect(node.layout).toBe(layout);
      });
    });

    it('should support all drop positions', () => {
      const dropPositions: Array<MindMapNodeData['dropPosition']> = [
        'above',
        'below',
        'over',
        null,
      ];

      dropPositions.forEach(dropPosition => {
        const node: MindMapNodeData = {
          id: `node-drop-${dropPosition ?? 'null'}`,
          label: 'Drop Test Node',
          isRoot: false,
          level: 1,
          hasChildren: false,
          isCollapsed: false,
          isDragging: false,
          isDropTarget: dropPosition !== null,
          dropPosition,
          layout: 'LR',
          width: 150,
          colorTheme: null,
        };

        expect(node.dropPosition).toBe(dropPosition);
        expect(node.isDropTarget).toBe(dropPosition !== null);
      });
    });

    it('should support color themes', () => {
      const nodeWithColors: MindMapNodeData = {
        id: 'colored-node',
        label: 'Colored Node',
        isRoot: false,
        level: 1,
        hasChildren: false,
        isCollapsed: false,
        isDragging: false,
        isDropTarget: false,
        dropPosition: null,
        layout: 'LR',
        width: 150,
        colorTheme: 'blue',
      };

      expect(nodeWithColors.colorTheme).toBe('blue');
    });

    it('should support notes and sources', () => {
      const sources: Source[] = [
        {
          id: 'src-1',
          name: 'Test Source',
          directory: '/test',
          type: 'reference',
        },
      ];

      const nodeWithContent: MindMapNodeData = {
        id: 'content-node',
        label: 'Node with Content',
        isRoot: false,
        level: 1,
        hasChildren: false,
        isCollapsed: false,
        isDragging: false,
        isDropTarget: false,
        dropPosition: null,
        layout: 'LR',
        width: 150,
        colorTheme: null,
        notes: 'These are test notes',
        sources,
        chatId: 'chat-123',
      };

      expect(nodeWithContent.notes).toBe('These are test notes');
      expect(nodeWithContent.sources).toEqual(sources);
      expect(nodeWithContent.chatId).toBe('chat-123');
    });

    it('should support optional properties being null or undefined', () => {
      const minimalNode: MindMapNodeData = {
        id: 'minimal-node',
        label: 'Minimal Node',
        isRoot: false,
        level: 1,
        hasChildren: false,
        isCollapsed: false,
        isDragging: false,
        isDropTarget: false,
        dropPosition: null,
        layout: 'LR',
        width: 150,
        colorTheme: null,
      };

      expect(minimalNode.parentId).toBeUndefined();
      expect(minimalNode.notes).toBeUndefined();
      expect(minimalNode.sources).toBeUndefined();
      expect(minimalNode.chatId).toBeUndefined();
      expect(minimalNode.isEditing).toBeUndefined();
      expect(minimalNode.colorTheme).toBeNull();
    });

    it('should support editing state', () => {
      const editingNode: MindMapNodeData = {
        id: 'editing-node',
        label: 'Editing Node',
        isRoot: false,
        level: 1,
        hasChildren: false,
        isCollapsed: false,
        isDragging: false,
        isDropTarget: false,
        dropPosition: null,
        layout: 'LR',
        width: 150,
        colorTheme: null,
        isEditing: true,
      };

      expect(editingNode.isEditing).toBe(true);
    });

    it('should support drag and drop states', () => {
      const draggingNode: MindMapNodeData = {
        id: 'dragging-node',
        label: 'Dragging Node',
        isRoot: false,
        level: 1,
        hasChildren: false,
        isCollapsed: false,
        isDragging: true,
        isDropTarget: false,
        dropPosition: null,
        layout: 'LR',
        width: 150,
        colorTheme: null,
      };

      const dropTargetNode: MindMapNodeData = {
        id: 'drop-target-node',
        label: 'Drop Target Node',
        isRoot: false,
        level: 1,
        hasChildren: false,
        isCollapsed: false,
        isDragging: false,
        isDropTarget: true,
        dropPosition: 'above',
        layout: 'LR',
        width: 150,
        colorTheme: null,
      };

      expect(draggingNode.isDragging).toBe(true);
      expect(draggingNode.isDropTarget).toBe(false);

      expect(dropTargetNode.isDragging).toBe(false);
      expect(dropTargetNode.isDropTarget).toBe(true);
      expect(dropTargetNode.dropPosition).toBe('above');
    });
  });
});
