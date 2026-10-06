import { Collapse, Card, Descriptions, List, Tag, Typography } from "antd";

const { Title, Paragraph, Text } = Typography;

interface WorkflowStep {
  name: string;
  action: string;
  table: string;
  field_mapping?: Record<string, any>;
  success_criteria?: string;
  exceptions?: string[];
}

interface Workflow {
  name: string;
  description: string;
  trigger?: string;
  preconditions?: string[];
  steps: WorkflowStep[];
  postconditions?: string[];
  kpis?: string[];
}

export default function WorkflowsView({ workflows }: { workflows: Workflow[] }) {
  return (
    <Card style={{ marginBottom: 24 }} title="Workflows / Business Processes">
      <Collapse
        accordion
        items={workflows.map((wf, idx) => ({
          key: String(idx),
          label: wf.name,
          children: (
            <div>
              {/* Description */}
              <Paragraph>{wf.description}</Paragraph>

              {/* Trigger */}
              {wf.trigger && (
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label="Trigger">
                    {wf.trigger}
                  </Descriptions.Item>
                </Descriptions>
              )}

              {/* Preconditions */}
              {wf.preconditions && wf.preconditions.length > 0 && (
                <>
                  <Title level={5} style={{ marginTop: 16 }}>
                    Preconditions
                  </Title>
                  <List
                    size="small"
                    dataSource={wf.preconditions}
                    renderItem={(item) => <List.Item>• {item}</List.Item>}
                  />
                </>
              )}

              {/* Steps */}
              <Title level={5} style={{ marginTop: 16 }}>
                Steps
              </Title>
              <List
                dataSource={wf.steps}
                renderItem={(step, i) => (
                  <List.Item>
                    <Card size="small" style={{ width: "100%" }}>
                      <Title level={5}>
                        {i + 1}. {step.name}
                      </Title>

                      <Paragraph>
                        <Text strong>Action:</Text> {step.action}
                      </Paragraph>

                      <Paragraph>
                        <Text strong>Table:</Text>{" "}
                        <Tag color="blue">{step.table}</Tag>
                      </Paragraph>

                      {step.field_mapping && (
                        <Paragraph>
                          <Text strong>Field Mapping:</Text>
                          <pre style={{ marginTop: 8 }}>
                            {JSON.stringify(step.field_mapping, null, 2)}
                          </pre>
                        </Paragraph>
                      )}

                      {step.success_criteria && (
                        <Paragraph>
                          <Text strong>Success Criteria:</Text>{" "}
                          {step.success_criteria}
                        </Paragraph>
                      )}

                      {step.exceptions && step.exceptions.length > 0 && (
                        <>
                          <Text strong>Exceptions:</Text>
                          <List
                            size="small"
                            dataSource={step.exceptions}
                            renderItem={(ex) => (
                              <List.Item>
                                <Tag color="red">Exception</Tag> {ex}
                              </List.Item>
                            )}
                          />
                        </>
                      )}
                    </Card>
                  </List.Item>
                )}
              />

              {/* Postconditions */}
              {wf.postconditions && wf.postconditions.length > 0 && (
                <>
                  <Title level={5} style={{ marginTop: 16 }}>
                    Postconditions
                  </Title>
                  <List
                    size="small"
                    dataSource={wf.postconditions}
                    renderItem={(item) => <List.Item>• {item}</List.Item>}
                  />
                </>
              )}

              {/* KPIs */}
              {wf.kpis && wf.kpis.length > 0 && (
                <>
                  <Title level={5} style={{ marginTop: 16 }}>
                    KPIs
                  </Title>
                  <List
                    size="small"
                    dataSource={wf.kpis}
                    renderItem={(kpi) => (
                      <List.Item>
                        <Tag color="green">KPI</Tag> {kpi}
                      </List.Item>
                    )}
                  />
                </>
              )}
            </div>
          ),
        }))}
      />
    </Card>
  );
}
