import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];

interface JSONViewerProps {
  value: JSONValue;
  name?: string;
  level?: number;
  isLast?: boolean;
}

function JSONValueComponent({
  value,
  name,
  level = 0,
  isLast = true,
}: JSONViewerProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels

  // Prevent infinite recursion
  if (level > 10) {
    return <span className="text-red-400">Max nesting depth reached</span>;
  }

  const copyValue = () => {
    navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    toast.success('Copied to clipboard');
  };

  const renderValue = (val: JSONValue, key?: string): React.ReactNode => {
    if (val === null) {
      return <span className="text-gray-500">null</span>;
    }

    if (typeof val === 'boolean') {
      return <span className="text-purple-400">{val.toString()}</span>;
    }

    if (typeof val === 'number') {
      return <span className="text-blue-400">{val}</span>;
    }

    if (typeof val === 'string') {
      // Check if the string is actually JSON
      const trimmed = val.trim();
      if (
        val.length > 0 &&
        ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']')))
      ) {
        try {
          const parsed = JSON.parse(val);
          // Return the parsed JSON without the quotes - let it render as a nested structure
          return renderValue(parsed, key);
        } catch (error) {
          // Try to fix common JSON issues and parse again
          try {
            // Attempt to properly escape the string and parse it
            const fixedJson = val
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r')
              .replace(/\t/g, '\\t');
            const parsed = JSON.parse(fixedJson);
            return renderValue(parsed, key);
          } catch {
            // Show as broken JSON with error indicator
            return (
              <div className="border border-red-500 bg-red-900/20 p-2 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-red-400 text-xs font-semibold">
                    ⚠ INVALID JSON
                  </span>
                  <span className="text-red-300 text-xs">
                    This appears to be JSON but contains syntax errors
                  </span>
                </div>
                <pre className="text-red-300 text-sm whitespace-pre-wrap font-mono max-h-32 overflow-auto">
                  {val}
                </pre>
                <div className="text-red-400 text-xs mt-1">
                  Error:{' '}
                  {error instanceof Error ? error.message : String(error)}
                </div>
              </div>
            );
          }
        }
      }

      // Show full string for debug viewer
      return (
        <div className="flex items-center gap-2">
          <span className="text-green-400">"{val}"</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(val);
              toast.success('Copied string');
            }}
            className="text-xs px-1 py-0.5 bg-gray-600 hover:bg-gray-700 rounded text-white opacity-0 group-hover:opacity-100"
            title="Copy string"
          >
            Copy
          </button>
        </div>
      );
    }

    if (Array.isArray(val)) {
      return renderArray(val, key);
    }

    if (typeof val === 'object') {
      return renderObject(val, key);
    }

    return <span className="text-gray-300">{String(val)}</span>;
  };

  const renderArray = (arr: JSONArray, key?: string) => {
    const isEmpty = arr.length === 0;
    const displayKey = key ? `"${key}": ` : '';

    if (isEmpty) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-blue-300">{displayKey}[]</span>
        </div>
      );
    }

    return (
      <div>
        <div
          className="flex items-center gap-1 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronDown size={12} className="text-gray-400" />
          ) : (
            <ChevronRight size={12} className="text-gray-400" />
          )}
          <span className="text-blue-300">{displayKey}[</span>
          {!isExpanded && (
            <span className="text-gray-500 text-xs ml-1">
              {arr.length} items
            </span>
          )}
          <button
            onClick={e => {
              e.stopPropagation();
              copyValue();
            }}
            className="ml-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded"
            title="Copy array"
          >
            <Copy size={10} />
          </button>
        </div>
        {isExpanded && (
          <div className="ml-4">
            {arr.map((item, index) => (
              <div key={index} className="group">
                <span className="text-gray-500 text-xs mr-2">{index}:</span>
                <JSONValueComponent
                  value={item}
                  level={level + 1}
                  isLast={index === arr.length - 1}
                />
              </div>
            ))}
          </div>
        )}
        {isExpanded && <span className="text-blue-300">]</span>}
      </div>
    );
  };

  const renderObject = (obj: JSONObject, key?: string) => {
    const keys = Object.keys(obj);
    const isEmpty = keys.length === 0;
    const displayKey = key ? `"${key}": ` : '';

    if (isEmpty) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-yellow-300">
            {displayKey}
            {'{}'}
          </span>
        </div>
      );
    }

    return (
      <div>
        <div
          className="flex items-center gap-1 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronDown size={12} className="text-gray-400" />
          ) : (
            <ChevronRight size={12} className="text-gray-400" />
          )}
          <span className="text-yellow-300">
            {displayKey}
            {'{'}
          </span>
          {!isExpanded && (
            <span className="text-gray-500 text-xs ml-1">
              {keys.length} keys
            </span>
          )}
          <button
            onClick={e => {
              e.stopPropagation();
              copyValue();
            }}
            className="ml-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded"
            title="Copy object"
          >
            <Copy size={10} />
          </button>
        </div>
        {isExpanded && (
          <div className="ml-4">
            {keys.map((objKey, index) => (
              <div key={objKey} className="group flex">
                <span className="text-blue-300">"{objKey}"</span>
                <span className="text-gray-500 mx-1">:</span>
                <div className="flex-1">
                  <JSONValueComponent
                    value={obj[objKey]}
                    level={level + 1}
                    isLast={index === keys.length - 1}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {isExpanded && <span className="text-yellow-300">{'}'}</span>}
      </div>
    );
  };

  if (name) {
    return (
      <div className="group">
        <span className="text-blue-300">"{name}"</span>
        <span className="text-gray-500 mx-1">:</span>
        {renderValue(value)}
        {!isLast && <span className="text-gray-500">,</span>}
      </div>
    );
  }

  return <div className="group">{renderValue(value)}</div>;
}

export function JSONViewer({
  content,
  showControls = true,
}: {
  content: unknown;
  showControls?: boolean;
}) {
  const [rawView, setRawView] = useState(false);

  // Handle different content types
  let jsonData: JSONValue;
  let isValidJSON = false;

  if (typeof content === 'string') {
    try {
      jsonData = JSON.parse(content) as JSONValue;
      isValidJSON = true;
    } catch {
      // Not valid JSON, show as plain text
      isValidJSON = false;
      jsonData = content;
    }
  } else {
    // Content is already an object
    jsonData = content as JSONValue;
    isValidJSON = true;
  }

  if (!isValidJSON || rawView) {
    return (
      <div className="relative">
        {isValidJSON && showControls && (
          <div className="absolute top-2 right-2">
            <button
              onClick={() => setRawView(!rawView)}
              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white"
            >
              {rawView ? 'Tree View' : 'Raw View'}
            </button>
          </div>
        )}
        <pre
          className={`text-sm text-gray-300 whitespace-pre-wrap overflow-auto ${showControls ? 'min-h-[50vh] h-full' : ''} font-mono`}
        >
          {typeof content === 'string'
            ? content
            : JSON.stringify(content, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="relative">
      {showControls && (
        <div className="absolute top-2 right-2 flex gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
              toast.success('Copied formatted JSON');
            }}
            className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white flex items-center gap-1"
          >
            <Copy size={12} />
            Copy JSON
          </button>
          <button
            onClick={() => setRawView(true)}
            className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white"
          >
            Raw View
          </button>
        </div>
      )}
      <div
        className={`text-sm text-gray-300 overflow-auto ${showControls ? 'min-h-[50vh] h-full pt-8' : ''} font-mono`}
      >
        <JSONValueComponent value={jsonData} level={0} />
      </div>
    </div>
  );
}
