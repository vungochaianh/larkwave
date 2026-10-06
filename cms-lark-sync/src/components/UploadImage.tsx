import React, { useState } from "react";
import { Button, Spin, Upload, message } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import axios from "axios";
import Image from "next/image";

interface UploadImageProps {
  onUploadSuccess: (data: any) => void; // Callback function để trả về response data
}

const UploadImage: React.FC<UploadImageProps> = ({ onUploadSuccess }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false); // Trạng thái upload
  const [messageApi, contextHolder] = message.useMessage();
  const handleUpload = async (file: File) => {
    setImageUrl(null);
    setIsUploading(true); // Bắt đầu upload
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "ainow.com.vn"); // Đảm bảo bạn đã tạo preset này
    formData.append(
      "cloud_name",
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""
    );

    try {
      const response = await axios.post(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
        formData
      );
      const imageSrc = response.data.url;
      setImageUrl(imageSrc);
      messageApi.success("Upload thành công!");
      onUploadSuccess(response.data); // Gọi callback với response data
    } catch (error) {
      messageApi.error("Upload thất bại!");
    } finally {
      setIsUploading(false); // Kết thúc upload
    }
  };

  const uploadProps = {
    beforeUpload: (file: File) => {
      handleUpload(file);
      return false; // Ngăn không cho Ant Design xử lý upload
    },
    showUploadList: false, // Ẩn danh sách ảnh đã upload
  };

  return (
    <div className="flex flex-col gap-2">
      {contextHolder}
      <Upload {...uploadProps}>
        <Button icon={<UploadOutlined />} disabled={isUploading}>
          {isUploading ? "Uploading..." : "Upload Image"}
        </Button>
      </Upload>
      {isUploading ? (
        <Spin />
      ) : (
        imageUrl && (
          <Image alt="Uploaded image" src={imageUrl} width={100} height={100} />
        )
      )}
    </div>
  );
};

export default UploadImage;
