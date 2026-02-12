import Anthropic from "@anthropic-ai/sdk";

// ── Tool definitions ─────────────────────────────────────────────
// Each tool has a tight schema. Claude fills in structured fields,
// the server renders them into ANSI terminal bytes. Markdown cannot
// exist because there is no free-text "output" blob.

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "file_listing",
    description:
      "Display a directory listing. Used when the operator runs ls.",
    input_schema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Absolute path of the directory being listed",
        },
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: {
                type: "string",
                enum: ["file", "dir", "symlink"],
              },
              permissions: {
                type: "string",
                description: "e.g. rwxr-xr-x",
              },
              owner: { type: "string" },
              group: { type: "string" },
              size: {
                type: "string",
                description: "Human-readable, e.g. 4.2K",
              },
              modified: {
                type: "string",
                description: "e.g. Mar 14 09:32",
              },
              link_target: {
                type: "string",
                description: "Symlink target path",
              },
            },
            required: ["name", "type"],
          },
        },
      },
      required: ["cwd", "entries"],
    },
  },

  {
    name: "file_content",
    description:
      "Display raw file contents. Used when the operator runs cat. " +
      "The content field contains the literal bytes of the file. " +
      "For code files: write real, working, importable code with types, " +
      "implementations, and comments that reveal engineering history. " +
      "Never describe code. Write it.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute path of the file",
        },
        content: {
          type: "string",
          description:
            "The raw file content — actual source code, config, or data",
        },
        language: {
          type: "string",
          description: "Language identifier, e.g. typescript, json, yaml",
        },
      },
      required: ["path", "content"],
    },
  },

  {
    name: "command_output",
    description:
      "Generic command output. Used for grep, find, echo, whoami, " +
      "uname, git, pwd, tree, and any command not covered by other tools.",
    input_schema: {
      type: "object" as const,
      properties: {
        lines: {
          type: "array",
          items: { type: "string" },
          description: "Output lines. One string per terminal line.",
        },
      },
      required: ["lines"],
    },
  },

  {
    name: "process_list",
    description: "Display running processes. Used when the operator runs ps.",
    input_schema: {
      type: "object" as const,
      properties: {
        processes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pid: { type: "number" },
              user: { type: "string" },
              cpu: { type: "string" },
              mem: { type: "string" },
              vsz: { type: "string" },
              rss: { type: "string" },
              tty: { type: "string" },
              stat: { type: "string" },
              start: { type: "string" },
              time: { type: "string" },
              command: { type: "string" },
            },
            required: ["pid", "user", "command"],
          },
        },
      },
      required: ["processes"],
    },
  },

  {
    name: "system_status",
    description:
      "Display a diagnostics panel with box-drawing borders. " +
      "Used for suit status, system checks, reactor diagnostics.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
              status: {
                type: "string",
                enum: ["ok", "warning", "critical", "inactive", "info"],
              },
            },
            required: ["label", "value"],
          },
        },
      },
      required: ["title", "entries"],
    },
  },

  {
    name: "jarvis_comment",
    description:
      "A brief remark from JARVIS. Personality, warnings, commentary. " +
      "1-3 sentences maximum. Use after other tools, or alone for " +
      "conversational responses.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description: "Plain text. No formatting.",
        },
      },
      required: ["text"],
    },
  },
];
