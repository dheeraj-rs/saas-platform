variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "enterprise-saas"
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "domain_names" {
  description = "List of domain names for CloudFront"
  type        = list(string)
  default     = []
}

variable "ssl_certificate_arn" {
  description = "ARN of the SSL certificate in ACM"
  type        = string
}

variable "ecr_repository_url" {
  description = "ECR repository URL for the application image"
  type        = string
}

variable "app_version" {
  description = "Version tag of the application image"
  type        = string
  default     = "latest"
}

variable "ecs_cpu" {
  description = "CPU units for ECS task"
  type        = number
  default     = 512
}

variable "ecs_memory" {
  description = "Memory for ECS task"
  type        = number
  default     = 1024
}

variable "app_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}

variable "app_min_capacity" {
  description = "Minimum number of ECS tasks"
  type        = number
  default     = 2
}

variable "app_max_capacity" {
  description = "Maximum number of ECS tasks"
  type        = number
  default     = 10
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "mongodb_uri" {
  description = "MongoDB connection string"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT secret key"
  type        = string
  sensitive   = true
}

variable "nextauth_secret" {
  description = "NextAuth secret key"
  type        = string
  sensitive   = true
}

# Monitoring and alerting variables
variable "enable_monitoring" {
  description = "Enable CloudWatch monitoring and alerting"
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "Email address for alerts"
  type        = string
  default     = ""
}

# Security variables
variable "enable_waf" {
  description = "Enable AWS WAF"
  type        = bool
  default     = true
}

variable "allowed_ip_ranges" {
  description = "List of allowed IP ranges for admin access"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# Database variables
variable "mongodb_backup_retention" {
  description = "MongoDB backup retention in days"
  type        = number
  default     = 30
}

# Cost optimization variables
variable "enable_spot_instances" {
  description = "Enable Spot instances for non-production environments"
  type        = bool
  default     = false
}

# Compliance variables
variable "enable_config" {
  description = "Enable AWS Config for compliance monitoring"
  type        = bool
  default     = true
}

variable "enable_cloudtrail" {
  description = "Enable CloudTrail for audit logging"
  type        = bool
  default     = true
}

# Performance variables
variable "cloudfront_price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"
  
  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.cloudfront_price_class)
    error_message = "CloudFront price class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

# Backup variables
variable "backup_schedule" {
  description = "Cron expression for backup schedule"
  type        = string
  default     = "cron(0 2 * * ? *)" # Daily at 2 AM UTC
}

# Feature flags
variable "enable_container_insights" {
  description = "Enable ECS Container Insights"
  type        = bool
  default     = true
}

variable "enable_x_ray" {
  description = "Enable AWS X-Ray tracing"
  type        = bool
  default     = true
}

# Tags
variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# Environment-specific overrides
variable "environment_config" {
  description = "Environment-specific configuration overrides"
  type = object({
    ecs_cpu                = optional(number)
    ecs_memory             = optional(number)
    app_desired_count      = optional(number)
    app_min_capacity       = optional(number)
    app_max_capacity       = optional(number)
    redis_node_type        = optional(string)
    log_retention_days     = optional(number)
    enable_deletion_protection = optional(bool)
  })
  default = {}
}