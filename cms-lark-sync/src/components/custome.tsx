import useUser from "@/store/user";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { Badge, Button, Card, Form, Input, Modal, Space, Table } from "antd";
import { ExpandableConfig } from "antd/es/table/interface";
import { useRouter } from "next/navigation";
import { ReactNode, useState } from "react";

interface MyButtonProps {
  type?: any;
}

interface MyCardProps {
  icon?: any;
  title?: string;
  subTitle?: string;
  cardBg?: string;
}
const MyCard: React.FC<MyCardProps> = ({
  icon,
  subTitle,
  title,
  cardBg,
}: MyCardProps) => {
  return (
    <Card
      className="w-[240px] shadow-sm text-center max-lg:w-full"
      style={{
        background: cardBg ? cardBg : "",
      }}
    >
      <p className="text-4xl text-[#333399] flex justify-center items-center">
        {" "}
        {icon}
      </p>
      <h4 className="font-bold text-[#333399]">{title}</h4>
      <p className="text-[15.25px] mt-1 ">{subTitle}</p>
    </Card>
  );
};

interface PriceCardProps {
  title?: string;
  subTitle?: any;
}
const PriceCard: React.FC<PriceCardProps> = ({
  subTitle,
  title,
}: PriceCardProps) => {
  return (
    <Card className="w-[240px] shadow-sm  max-lg:w-full">
      <h4 className="font-bold text-[#333399] text-center">{title}</h4>
      <p className="text-[15.25px] mt-1 ">{subTitle}</p>
    </Card>
  );
};

interface ModalCustomProps {
  closeIcon?: boolean;
  htmlType?: "button" | "reset" | "submit";
  title?: any;
  contentModal?: ReactNode | ((handleCancel: () => void) => ReactNode);
  rulesOpen?: boolean;
  button?: ReactNode;
  isButton?: boolean;
  onClick?: () => Promise<void> | void;
  onCancel?: () => void;
  widthModal?: number;
  styleButton?: string;
  typeButton?: "primary" | "dashed" | "link" | "text" | "default" | undefined;
  shapeButton?: "circle" | "round" | "default";
  sizeButton?: "large" | "middle" | "small";
}

const ModalCustom: React.FC<ModalCustomProps> = ({
  title,
  contentModal,
  rulesOpen = true,
  button,
  isButton = false,
  closeIcon = true,
  onClick,
  onCancel,
  widthModal,
  styleButton,
  typeButton = "primary",
  htmlType,
  shapeButton = "default",
  sizeButton = "middle",
}) => {
  const [open, setOpen] = useState(false);
  const handleOk = () => {
    setOpen(false);
  };
  const handleCancel = () => {
    setOpen(false);
    if (onCancel) onCancel();
  };

  const handleButtonClick = async () => {
    if (onClick) {
      const result = onClick();
      if (result instanceof Promise) {
        await result;
      }
    }
    rulesOpen && setOpen(true);
  };

  return (
    <>
      {isButton ? (
        <Button
          htmlType={htmlType}
          size={sizeButton}
          type={typeButton}
          shape={shapeButton}
          className={`${styleButton}`}
          onClick={handleButtonClick}
        >
          {button}
        </Button>
      ) : (
        <span
          className={`${styleButton} font-medium`}
          onClick={handleButtonClick}
        >
          {button}
        </span>
      )}

      <Modal
        open={open}
        closeIcon={null}
        footer={null}
        onOk={handleOk}
        onCancel={handleCancel}
        width={widthModal}
      >
        <Space direction="vertical" size={"middle"} className="w-full">
          <div className="flex justify-between items-center">
            <span className="font-bold text-[#0C092A] text-lg">{title}</span>
            {closeIcon ? (
              <span
                className="bg-[#fdeeee] w-6 h-6 rounded-[100%] text-[#ee7677] flex justify-center items-center cursor-pointer p-1"
                onClick={handleCancel}
              >
                <CloseOutlined />
              </span>
            ) : null}
          </div>
          {typeof contentModal === "function"
            ? contentModal(handleCancel)
            : contentModal}
        </Space>
      </Modal>
    </>
  );
};

interface TableCustomeProps {
  data?: any;
  typeProduct?: number;
  loading?: boolean;
  callBack?: (value: boolean) => void;
  columns?: any;
  usePage?: boolean;
  tableStyle?: "normal" | "contract" | any;
  screen?: "remind" | "normal" | any;
  paginationTotal?: number;
  expandable?: ExpandableConfig<any>;
  onChangePagination?: (pagination: {
    current: number;
    pageSize: number;
  }) => void;
  [key: string]: any;
}
const TableCustome: React.FC<TableCustomeProps> = ({
  data,
  columns,
  tableStyle,
  usePage = true,
  paginationTotal = 0,
  callBack,
  expandable,
  onChangePagination,
  typeProduct,
  screen,
  ...props
}: TableCustomeProps) => {
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    showSizeChanger: true,
  });

  const handleTableChange = (pag: any) => {
    setPagination((prev) => ({
      ...prev,
      current: pag.current,
      pageSize: pag.pageSize,
    }));

    onChangePagination?.({
      current: pag.current,
      pageSize: pag.pageSize,
    });
  };

  // logic của phần table hợp đồng end
  return (
    <Table
      key={data?.length}
      className="custom-table"
      rowKey="id"
      columns={columns}
      dataSource={data}
      // loading={!data}
      pagination={
        usePage && paginationTotal > 10
          ? {
              ...pagination,
              pageSizeOptions:
                paginationTotal > 20
                  ? ["10", "20", "50"]
                  : paginationTotal > 10
                  ? ["10", "20"]
                  : ["10"],
              total: paginationTotal,
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} của ${total} mục`,
            }
          : false
      }
      onChange={handleTableChange}
    />
  );
};

interface LabelProps {
  SVGSource?: string;
  icon?: React.ReactNode;
  title?: string;
  danger?: boolean;
  className?: string;
  badge?: number;
}
const Label: React.FC<LabelProps> = ({
  SVGSource,
  title,
  icon = <PlusOutlined />,
  danger,
  className = 'min-w-[150px]',
  badge,
}: LabelProps) => {
  return (
    <div
      className={`text-[14px] font-medium flex gap-2  items-center ${className} py-1 `}
      style={{
        color: danger ? '#FF4F66' : '#6D6B7F',
      }}>
      {SVGSource ? (
        <img
          src={`/svg/${SVGSource}`}
          width={20}
          height={20}
          alt="#"
          style={{width: '20px !important', height: '20px !important'}}
        />
      ) : (
        icon
      )}
      <p>{title}</p>
      {(badge || badge == 0) && (
        <Badge className="absolute right-2" count={badge} showZero />
      )}
    </div>
  );
};

export { MyCard, PriceCard, ModalCustom, TableCustome,Label };
