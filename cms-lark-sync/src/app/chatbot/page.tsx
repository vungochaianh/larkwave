"use client";

import { useState } from "react";
import { Spin, Divider, Card } from "antd";
import PromptForm from "@/components/PromptForm";
import { generateSpec } from "@/services/chatApi";

import MetaBlock from "@/components/MetaBlock";
import DocumentsTabs from "@/components/DocumentsTabs";
import TablesView from "@/components/TablesView";
import WorkflowsView from "@/components/WorkflowsView";
import DiagramsView from "@/components/DiagramsView";
import AutomationsView from "@/components/AutomationsView";
import SampleDataView from "@/components/SampleDataView";
import AppShell from "@/components/AppShell";
import { LarkSpec } from "../../../types/larkSpec";
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LarkSpec | null>(null);

  const onSubmit = async (v: any) => {
    setLoading(true);
    try {
      const res = await generateSpec({
        message: v.message,
        configId: v.configId,
        options: {
          language: v.language,
          detailLevel: v.detailLevel,
          includeAutomations: true,
          includeSampleData: true,
          configId: v.configId,
        },
      });
      setData(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
            <div>

        <Card className="">
      <PromptForm onSubmit={onSubmit} />
      <Divider />

      {loading && <Spin />}

      {data && (
        <>
          <MetaBlock meta={data.meta} />
          <DocumentsTabs documents={data.documents} />
          <TablesView tables={data.tables} />
          <WorkflowsView workflows={data.workflows} />
          <DiagramsView diagrams={data.diagrams} />
          <AutomationsView automations={data.automations} />
          <SampleDataView sampleData={data.sample_data} />
        </>
      )}

        </Card>
        <TourGuide pageKey="chatbot" steps={tourSteps['chatbot']} />
        </div>
  );
}
