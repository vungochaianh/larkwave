import { EditFilled, PlusCircleFilled } from "@ant-design/icons";
import { Label, ModalCustom } from "../custome";
import { Button, Form, Input, InputNumber, message, Space } from "antd";
import Password from "antd/es/input/Password";
import usePackage from "@/store/package";
import Utils from "@/function/utils";
import Image from "next/image";
import useUser from "@/store/user";
import useStaff from "@/store/staff";

interface FormPackageProps {
  typeForm?: "create" | "update" | "delete" | "register_user";
  record?: any;
  callBack?: (value: boolean) => void;
  [key: string]: any;
}

const FormPackage: React.FC<FormPackageProps> = ({
  typeForm,
  record,
  callBack,
  ...props
}: FormPackageProps) => {
  const [form] = Form.useForm();
  const {staff} = useStaff()
  const u = new Utils();
  const [messageApi, contextHolder] = message.useMessage();
  const textButton =
    typeForm == "create"
      ? "Thêm"
      : typeForm == "update"
      ? ""
      : typeForm == "delete"
      ? "Xóa"
      : typeForm == "register_user"
      ? "Mua gói"
      : "Null";
  const apis = {
    create: usePackage.getState().create,
    update: usePackage.getState().update,
    delete: usePackage.getState().delete
  };
  const buildPayload = {
    create: (values: any) => ({
      name: values.name,
      days: values.days,
      price: values.price,
      staff_id: staff.id
    }),
    update: (values: any) => ({
      package_id: record.id,
      name: values.name,
      days: values.days,
      price: values.price,
      status: 1,
      staff_id: staff.id
    }),
    delete: (values: any) => ({
      id: record.id,
      staff_id: staff.id,
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
      messageApi.success("Tạo gói thành công!");
      callBack && callBack(true);
    });
  };

  return (
    <>
      {contextHolder}
      {typeForm == "delete" ? (
        <ModalCustom
          closeIcon={false}
          widthModal={391}
          contentModal={(handleCancel) => (
            <div className="flex flex-col justify-center items-center gap-3 text-[#0C092A]">
              <Image
                src={"/svg/trash-circle.svg"}
                alt="#"
                width={64}
                height={64}
              />
              <h3 className="font-bold ">Xóa sản phẩm</h3>
              <span className="text-base text-center font-normal">
                Sau khi xóa sản phẩm sẽ không thể khôi phục. Bạn có chắc với lựa
                chọn của mình?
              </span>
              <Space size={"small"} className="mt-5">
                <Button type="text" onClick={handleCancel}>
                  Hủy
                </Button>
                <Button danger type="primary" onClick={onFinish}>
                  Xác nhận
                </Button>
              </Space>
            </div>
          )}
          button={
            <Label
              SVGSource="action/trash.svg"
              danger
              className="cursor-pointer"
            />
          }
        />
      ) : (
        <ModalCustom
        title={`${textButton} Gói`}
           styleButton="cursor-pointer"
          isButton={typeForm == "create"}
          button={
            <>
              {typeForm == "create" ? <><PlusCircleFilled />{textButton}</> : <EditFilled/>} 
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
                name={"name"}
                label="Tên gói"
                rules={[
                  {
                    required: true,
                    message: "Tên gói là bắt buộc",
                  },
                ]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name={"price"}
                label="Giá gói"
                rules={[
                  {
                    required: true,
                    message: "Giá gói là bắt buộc",
                  },
                ]}
              >
                <InputNumber
                  className="w-full"
                  formatter={u.formatNumber}
                  addonAfter="VNĐ"
                  parser={(value) => value?.replace(/\./g, "")}
                />
              </Form.Item>
              <Form.Item
                name={"days"}
                label="Số ngày"
                rules={[
                  {
                    required: true,
                    message: "Số ngày là bắt buộc",
                  },
                ]}
              >
                <InputNumber className="w-full" addonAfter="ngày" />
              </Form.Item>

              <div className="flex gap-4">
                <Form.Item className="w-full">
                  <Button
                    type="primary"
                    htmlType="submit"
                    className="w-full"
                    onClick={handleCancel}
                  >
                    Lưu gói
                  </Button>
                </Form.Item>
              </div>
            </Form>
          )}
        />
      )}
    </>
  );
};

export default FormPackage;
