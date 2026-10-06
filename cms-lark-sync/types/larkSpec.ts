export interface LarkSpec {
  meta: {
    system_name: string;
    domain: string;
    description: string;
  };
  documents: Record<string, string>;
  tables: any[];
  workflows: any[];
  diagrams: any;
  automations: any[];
  sample_data: Record<string, any[]>;
}
