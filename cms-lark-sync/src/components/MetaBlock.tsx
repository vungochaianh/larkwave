import { Card, Descriptions, Typography } from "antd";

const { Title, Paragraph } = Typography;

interface MetaBlockProps {
  meta: {
    system_name: string;
    domain: string;
    description: string;
  };
}

export default function MetaBlock({ meta }: MetaBlockProps) {
  return (
    <Card style={{ marginBottom: 24 }}>
      <Title level={3} style={{ marginBottom: 8 }}>
        {meta.system_name}
      </Title>

      <Descriptions
        size="small"
        column={1}
        bordered
        style={{ marginBottom: 16 }}
      >
        <Descriptions.Item label="Domain">
          {meta.domain}
        </Descriptions.Item>
      </Descriptions>

      <Paragraph style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {meta.description}
      </Paragraph>
    </Card>
  );
}
