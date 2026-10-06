import { EditFilled, PlusCircleFilled } from "@ant-design/icons";
import { Label, ModalCustom } from "../custome";
import { Button, Form, Input, InputNumber, message, Space } from "antd";
import Password from "antd/es/input/Password";
import usePartner from "@/store/partner";

interface FormPartnerProps {
  typeForm?: "create" | "update" | "delete";
  record?: any;
  callBack?: (value: boolean) => void;
}

const FormPartner: React.FC<FormPartnerProps> = ({
  typeForm,
  record,
  callBack,
}: FormPartnerProps) => {
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const textButton =
    typeForm == "create"
      ? "Thêm"
      : typeForm == "update"
      ? ""
      : typeForm == "delete"
      ? "Xóa"
      : "Null";
  const apis = {
    create: usePartner.getState().createPartner,
    update: usePartner.getState().updatePartner,
    delete: usePartner.getState().deletePartner,
  };
  const buildPayload = {
    create: (values: any) => ({
      full_name: values.full_name,
      email: values.email,
      password: values.password,
      role: values.role,
      role_staff: 1,
    }),
    update: (values: any) => ({
      id: record.id,
      full_name: values.full_name,
      email: values.email,
      role: values.role,
      role_staff: 1,
    }),
    delete: (values: any) => ({
      id: record.id,
      role_staff: 1,
    }),
  };

  const initialValues: Record<string, any> = {
    ...record,
  };

  const onFinish = async () => {
    const values = await form.getFieldsValue();
    const api = apis[typeForm as keyof typeof apis];
    const build = buildPayload[typeForm as keyof typeof buildPayload];

    if (!api || !build) return console.error("Invalid typeForm:", typeForm);
    const params = build(values);
    api(params, () => {
      messageApi.success("Tạo cổ đông thành công!");
      callBack && callBack(true);
    });
  };

  return (
    <>
      {contextHolder}
      <ModalCustom
        styleButton="cursor-pointer"
          isButton={typeForm == "create"}
          button={
            <>
              {typeForm == "create" ? <PlusCircleFilled /> : <EditFilled/>} {textButton}
            </>
          }
        contentModal={(handleCancel) => (
          <Form
            name="basic"
            layout="vertical"
            onFinish={onFinish}
            form={form}
            initialValues={initialValues}
          >
            <Form.Item
              label="Họ tên"
              name="full_name"
              rules={[{ required: true, message: "Họ tên là bắt buộc!" }]}
            >
              <Input className="w-full" />
            </Form.Item>

            <Form.Item
              label="Số điện thoại/email"
              name="email"
              rules={[
                { required: true, message: "Số điện thoại/Email là bắt buộc!" },
              ]}
            >
              <Input />
            </Form.Item>
            {typeForm == "create" && (
              <Form.Item
                label="Mật khẩu"
                name="password"
                rules={[{ required: true, message: "Mật khẩu là bắt buộc!" }]}
              >
                <Password />
              </Form.Item>
            )}

            <Form.Item
              label="Cổ phần"
              name="role"
              rules={[{ required: true, message: "Cổ phần là bắt buộc!" }]}
            >
              <InputNumber min={0} className="w-full" addonAfter="%" />
            </Form.Item>

            <div className="flex gap-4">
              <Form.Item className="w-full">
                <Button
                  type="primary"
                  htmlType="submit"
                  className="w-full"
                  onClick={handleCancel}
                >
                  Lưu đối tác
                </Button>
              </Form.Item>
            </div>
          </Form>
        )}
      />
    </>
  );
};

export default FormPartner;
