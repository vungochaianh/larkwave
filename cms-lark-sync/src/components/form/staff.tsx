import { EditFilled, PlusCircleFilled } from "@ant-design/icons";
import { Label, ModalCustom } from "../custome";
import { Button, Form, Input, InputNumber, message, Radio, Space } from "antd";
import Password from "antd/es/input/Password";
import useStaff from "@/store/staff";
import Image from "next/image";

interface FormStaffProps {
  typeForm?: "create" | "update" | "delete";
  record?: any;
  callBack?: (value: boolean) => void;
}

const FormStaff: React.FC<FormStaffProps> = ({
  typeForm,
  record,
  callBack,
}: FormStaffProps) => {
  const [form] = Form.useForm();
  const {staff} = useStaff()
  const [messageApi, contextHolder] = message.useMessage();
  const textButton =
    typeForm == "create"
      ? "Thêm"
      : typeForm == "update"
      ? "Cập nhật"
      : typeForm == "delete"
      ? "Xóa"
      : "Null";
  const apis = {
    create: useStaff.getState().create,
    update: useStaff.getState().update,
    delete: useStaff.getState().delete,
  };
  const buildPayload = {
    create: (values: any) => ({
      staff_id: staff.id,
      full_name: values.full_name,
      email: values.email,
      password: values.password,
      role: values.role,
    }),
    update: (values: any) => ({
      staff_id: staff.id,
      id: record.id,
      full_name: values.full_name,
      email: values.email,
      role: values.role,
    }),
    delete: (values: any) => ({
      id: record.id,
      email: record.email,
      staff_id: staff.id,
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
      messageApi.success(`${textButton} nhân viên thành công!`);
      callBack && callBack(true);
    });
  };

  {
  }
  return (
    <>
      {contextHolder}
      {
        typeForm == 'delete' ? 
        <ModalCustom
              closeIcon={false}
              widthModal={391}
              contentModal={handleCancel => (
                <div className="flex flex-col justify-center items-center gap-3 text-[#0C092A]">
                  <Image
                    src={'/svg/trash-circle.svg'}
                    alt="#"
                    width={64}
                    height={64}
                  />
                  <h3 className="font-bold ">Xóa nhân viên</h3>
                  <span className="text-base text-center font-normal">
                    Sau khi xóa nhân viên sẽ không thể khôi phục. Bạn có chắc với lựa chọn của mình?
                  </span>
                  <Space size={'small'} className="mt-5">
                    <Button type="text" onClick={handleCancel}>
                      Hủy
                    </Button>
                    <Button
                      danger
                      type="primary"
                      onClick={onFinish}>
                      Xác nhận
                    </Button>
                  </Space>
                </div>
              )}
              button={
                <Label SVGSource="action/trash.svg"  danger className='cursor-pointer' />
              }
            /> :
      <ModalCustom
            title={`${textButton} nhân viên`}
         styleButton="cursor-pointer"
          isButton={typeForm == "create"}
          button={
            <>
              {typeForm == "create" ?  <><PlusCircleFilled /> {textButton}</>: <EditFilled/>} 
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
              label="Chức vụ"
              name="role"
              rules={[{ required: true, message: "Chức vụ là bắt buộc!" }]}
            >
              <Radio.Group
               
              >
                <Radio value={2}>Staff</Radio>
                <Radio value={1}>Admin</Radio>
              </Radio.Group>
            </Form.Item>

            <div className="flex gap-4">
              <Form.Item className="w-full">
                <Button
                  type="primary"
                  htmlType="submit"
                  className="w-full"
                  onClick={handleCancel}
                >
                  Lưu nhân viên
                </Button>
              </Form.Item>
            </div>
          </Form>
        )}
      />
      }
    </>
  );
};

export default FormStaff;
