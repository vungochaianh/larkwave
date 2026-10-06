/* eslint-disable @next/next/no-img-element */
"use client";
// import { ModalCustom } from "@/components/custom";
// import { useCategory } from "@/stores/category_store";
// import { useTag } from "@/stores/tag_store";
import { DeleteFilled, EditFilled } from "@ant-design/icons";
import {
  Button,
  Form,
  Input,
  message,
  Popconfirm,
  Space,
  Table,
  Modal,
} from "antd";
import dayjs from "dayjs";
import { useEffect } from "react";
import { ModalCustom } from "../custome";
interface TagViewProps {
  type?: "tag" | "category";
}
const TagView: React.FC<TagViewProps> = ({ type }: TagViewProps) => {
  const isTag = type == "tag";
  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (name: any) => {
        const nameObject = name.find((name: any) => name.lang === "vi");
        return nameObject ? nameObject.text : "";
      },
    },
    {
      title: "Slug",
      dataIndex: "slug",
      key: "slug",
      render: (slug: any) => {
        const slugObject = slug.find((slug: any) => slug.lang === "vi");
        return slugObject ? slugObject.text : "";
      },
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      render: (created_at: any) =>
        dayjs(created_at).format("DD/MM/YYYY HH:mm:ss"),
    },
    {
      title: "Tác vụ",
      dataIndex: "action",
      key: "action",
      render: (_: any, record: any) => (
        <Space size="middle">
          <ModalCustom
            button={<EditFilled />}
            contentModal={(handleCancel) => (
              <Form
                layout="vertical"
                // onFinish={(values) => handleOk(values, "update")}
              >
                <Form.Item
                  label="Name"
                  name="name"
                  rules={[
                    { required: true, message: "Please input your Name!" },
                  ]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label="Slug"
                  name="slug"
                  rules={[
                    { required: true, message: "Please input your Slug!" },
                  ]}
                >
                  <Input />
                </Form.Item>
                <Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    onClick={() => handleCancel()}
                  >
                    Đồng ý
                  </Button>
                </Form.Item>
              </Form>
            )}
          />
          <Popconfirm
            title="Xóa thẻ"
            description="Sau khi xóa không thể khôi phục?"
            onConfirm={() => confirm(record._id)}
            okText="Đồng ý"
            cancelText="Hủy"
          >
            <DeleteFilled />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // const handleOk = (values: any, type?: string) => {
  //   const form = {
  //     name: [
  //       {
  //         lang: "vi",
  //         text: values.name,
  //       },
  //     ],
  //     slug: [
  //       {
  //         lang: "vi",
  //         text: values.slug,
  //       },
  //     ],
  //   };
  //   type == "create"
  //     ? isTag
  //       ? useTag
  //           .getState()
  //           .postTag(form)
  //           .then((result) => {
  //             useTag.getState().getTagList({});
  //             message.success(`Thêm thành công ${values.name}`);
  //           })
  //           .catch((err) => {
  //             alert("Lỗi");
  //           })
  //       : useCategory
  //           .getState()
  //           .postCategory(form)
  //           .then((result) => {
  //             useCategory.getState().getCategoryList({});
  //             message.success(`Thêm thành công ${values.name}`);
  //           })
  //           .catch((err) => {
  //             alert("Lỗi");
  //           })
  //     : isTag
  //     ? useTag
  //         .getState()
  //         .putTag(form)
  //         .then((result) => {
  //           useTag.getState().getTagList({});
  //         })
  //         .catch((err) => {
  //           alert("Lỗi");
  //         })
  //     : useCategory
  //         .getState()
  //         .putCategory(form)
  //         .then((result) => {
  //           useCategory.getState().getCategoryList({});
  //         })
  //         .catch((err) => {
  //           alert("Lỗi");
  //         });
  // };

  return (
    <div className="">
      <h1 className="text-center font-semibold">
        Quản lý thẻ {isTag ? " Tag" : " Category"}
      </h1>
      <ModalCustom
        isButton
        // className={"mb-8"}
        button="Thêm thẻ"
        contentModal={(handleCancel) => (
          <Form
            layout="vertical"
            // onFinish={(values) => handleOk(values, "add")}
          >
            <Form.Item
              label="Name"
              name="name"
              rules={[{ required: true, message: "Please input your Name!" }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              label="Slug"
              name="slug"
              rules={[{ required: true, message: "Please input your Slug!" }]}
            >
              <Input />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                onClick={() => handleCancel()}
              >
                Đồng ý
              </Button>
            </Form.Item>
          </Form>
        )}
      />
      <Table
        // dataSource={isTag ? tagData : categoryData}
        columns={columns}
        bordered
      />
    </div>
  );
};
export default TagView;
